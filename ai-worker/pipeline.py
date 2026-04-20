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

    aws_region = os.getenv("AWS_REGION", "ap-south-1")
    s3_client = boto3.client(
        "s3",
        region_name=aws_region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

    print(f"Downloading from S3: bucket={bucket}, key={key}")

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        s3_client.download_fileobj(bucket, key, tmp)
        return tmp.name


@app.get("/")
def home():
    return {"message": "Invoice AI Worker Running"}


@app.post("/process")
def process_invoice(data: InvoiceRequest):

    file_url = data.file

    print("Received file:", file_url)

    # -------------------------------
    # Download file from S3 (authenticated)
    # -------------------------------
    try:
        file_path = download_file_from_s3(file_url)
        print("Saved file locally:", file_path)
    except Exception as e:
        print(f"S3 download failed: {e}")
        return {"error": f"Failed to download file from S3: {str(e)}"}

    # Convert PDF to Image if necessary
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        if doc.is_pdf:
            print("PDF detected. Converting first page to image...")
            page = doc.load_page(0)
            # Render at higher resolution for better OCR
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_path = file_path + ".jpg"
            pix.save(img_path)
            doc.close()
            os.unlink(file_path)
            file_path = img_path
        else:
            # It's already an image
            doc.close()
            img_path = file_path + ".jpg"
            os.rename(file_path, img_path)
            file_path = img_path
    except Exception as e:
        print(f"PyMuPDF check passed/failed: {e}. Assuming original image.")
        img_path = file_path + ".jpg"
        os.rename(file_path, img_path)
        file_path = img_path

    # -------------------------------
    # Direct AI Vision Extraction
    # (No OCR — GPT-4.1 reads image directly)
    # -------------------------------
    print("Running GPT-4.1 Vision extraction...")
    invoice_json = extract_invoice_data(file_path, target_schema)
    print("Vision Extraction Completed")

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

    # GPT vision cross-check / correction pass — disabled (redundant, doubles cost & latency)
    # invoice_json = validate_invoice_with_gpt(file_path, invoice_json)

    print("Extraction + Validation Completed")

    # Clean up temp file
    try:
        os.unlink(file_path)
    except Exception:
        pass

    return {
        "status": "success",
        "invoice_data": invoice_json
    }