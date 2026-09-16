from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import tempfile
import os
import boto3
from urllib.parse import urlparse, unquote

from extractor import extract_invoice_data
from schema import target_schema
from postprocess import validate_invoice, clear_hallucinated_fields
from address_validator import validate_addresses
from gst_pan_validator import validate_gst_pan
from amount_validator import validate_amounts
from validationGPT import validate_invoice_with_gpt
from time_validator import fill_invoice_time
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

@app.on_event("startup")
def startup_event():
    access_key = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_KEY")
    bucket_var = os.getenv("AWS_S3_BUCKET") or os.getenv("AWS_BUCKET_NAME")
    
    print("=== AWS Config Check ===")
    if access_key:
        print("Detected AWS Access Key: " + ("AWS_ACCESS_KEY_ID" if os.getenv("AWS_ACCESS_KEY_ID") else "AWS_ACCESS_KEY"))
    else:
        print("Missing AWS Access Key! (S3 downloads will fail)")
        
    if secret_key:
        print("Detected AWS Secret Key: " + ("AWS_SECRET_ACCESS_KEY" if os.getenv("AWS_SECRET_ACCESS_KEY") else "AWS_SECRET_KEY"))
    else:
        print("Missing AWS Secret Key! (S3 downloads will fail)")
        
    if bucket_var:
        print("Detected AWS Bucket: " + ("AWS_S3_BUCKET" if os.getenv("AWS_S3_BUCKET") else "AWS_BUCKET_NAME"))
    else:
        print("No specific AWS Bucket var detected (Using S3 URL parsing fallback)")
    print("========================")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InvoiceRequest(BaseModel):
    file: str


def download_file_from_s3(s3_url: str) -> str:
    """
    Downloads a file from S3 using boto3 (authenticated).
    Returns the local file path.
    Works for private buckets where plain HTTP gives 403.
    """
    parsed = urlparse(s3_url)

    # Extract bucket name and key from the S3 URL
    # Formats supported:
    #   https://<bucket>.s3.<region>.amazonaws.com/<key>
    #   https://s3.<region>.amazonaws.com/<bucket>/<key>
    hostname = parsed.netloc  # e.g. lorreyproject.s3.ap-south-1.amazonaws.com
    path = unquote(parsed.path.lstrip("/"))  # e.g. upload-invoice/1234_file.jpg

    if ".s3." in hostname and hostname.endswith(".amazonaws.com"):
        # Virtual-hosted style: bucket.s3.region.amazonaws.com/key
        bucket = hostname.split(".s3.")[0]
        key = path
    elif hostname.startswith("s3.") and hostname.endswith(".amazonaws.com"):
        # Path-style: s3.region.amazonaws.com/bucket/key
        parts = path.split("/", 1)
        bucket = parts[0]
        key = parts[1] if len(parts) > 1 else ""
    else:
        raise ValueError(f"Cannot parse S3 URL: {s3_url}")

    aws_access_key = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY")
    aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_KEY")
    aws_region = os.getenv("AWS_REGION", "ap-south-1")
    s3_client = boto3.client(
        "s3",
        region_name=aws_region,
        aws_access_key_id=aws_access_key,
        aws_secret_access_key=aws_secret_key,
    )

    print(f"Downloading from S3: bucket={bucket}, key={key}")

    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                s3_client.download_fileobj(bucket, key, tmp)
                return tmp.name
        except Exception as e:
            print(f"S3 download failed on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                raise e
            time.sleep(2 ** attempt)


@app.get("/")
def home():
    return {"message": "Invoice AI Worker Running"}


@app.post("/process")
def process_invoice(data: InvoiceRequest):

    file_url = data.file

    print("Received file:", file_url)

    import time
    total_start = time.time()
    
    # -------------------------------
    # Download file from S3 (authenticated)
    # -------------------------------
    try:
        t0 = time.time()
        file_path = download_file_from_s3(file_url)
        print(f"[Profiling] S3 Download completed in {time.time() - t0:.2f}s")
        print("Saved file locally:", file_path)
    except Exception as e:
        print(f"S3 download failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to download file from S3: {str(e)}")

    # Convert PDF to Image or optimize image and encode to base64 in memory
    import base64
    from io import BytesIO
    from PIL import Image

    base64_image = None

    def optimize_and_encode_image(img_raw_bytes, max_dim=1600):
        """Helper to resize large images to max 1600px dimension to save tokens & prevent 429 rate limits"""
        try:
            with Image.open(BytesIO(img_raw_bytes)) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                w, h = img.size
                if w > max_dim or h > max_dim:
                    img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                buf = BytesIO()
                img.save(buf, format="JPEG", quality=85, optimize=True)
                return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as err:
            print(f"PIL Optimization fallback: {err}")
            return base64.b64encode(img_raw_bytes).decode("utf-8")

    try:
        t0 = time.time()
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        if doc.is_pdf:
            print("PDF detected. Converting first page to image in memory...")
            page = doc.load_page(0)
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            img_bytes = pix.tobytes("jpeg")
            base64_image = optimize_and_encode_image(img_bytes, max_dim=1600)
            doc.close()
        else:
            doc.close()
            with open(file_path, "rb") as img_file:
                raw_bytes = img_file.read()
                base64_image = optimize_and_encode_image(raw_bytes, max_dim=1600)
        print(f"[Profiling] Image processing completed in {time.time() - t0:.2f}s")
    except Exception as e:
        print(f"PyMuPDF check fallback: {e}. Reading raw image file.")
        with open(file_path, "rb") as img_file:
            base64_image = optimize_and_encode_image(img_file.read(), max_dim=1600)

    # -------------------------------
    # Direct AI Vision Extraction
    # (No OCR — GPT-4o reads image directly)
    # -------------------------------
    try:
        t0 = time.time()
        print("Running GPT-4o Vision extraction...")
        invoice_json = extract_invoice_data(base64_image, target_schema)
        print(f"[Profiling] Vision Extraction completed in {time.time() - t0:.2f}s")
        
        t0 = time.time()
        # -------------------------------
        # Post-processing & Validation
        # -------------------------------

        # Hard guard: clear fields the AI should never hallucinate
        invoice_json = clear_hallucinated_fields(invoice_json, "")

        # Rule-based validations
        invoice_json = validate_invoice(invoice_json)

        # Address validation
        invoice_json = validate_addresses(invoice_json)

        # GST / PAN validation
        invoice_json = validate_gst_pan(invoice_json)

        # Amount validation
        invoice_json = validate_amounts(invoice_json)

        # Time normalization
        invoice_json = fill_invoice_time(invoice_json)

        print(f"[Profiling] Post-processing & Validation completed in {time.time() - t0:.2f}s")
        print(f"[Profiling] Total Extraction Pipeline Time: {time.time() - total_start:.2f}s")
    except Exception as ai_e:
        import traceback
        traceback.print_exc()
        try:
            os.unlink(file_path)
        except Exception:
            pass
        from fastapi import HTTPException
        err_msg = str(ai_e)
        if "Authentication Failed" in err_msg or "Invalid API key" in err_msg:
            status_code = 401
        elif "busy due to rate limits" in err_msg or "rate_limit" in err_msg.lower() or "429" in err_msg:
            status_code = 429
        else:
            status_code = 500

        raise HTTPException(status_code=status_code, detail=f"AI Extraction failed: {err_msg}")

    # Clean up temp file
    try:
        os.unlink(file_path)
    except Exception:
        pass

    return {
        "status": "success",
        "invoice_data": invoice_json
    }