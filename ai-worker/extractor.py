import base64
import json
import os
import time
import random
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def extract_invoice_data(images, target_schema):
    """
    Directly extract structured invoice data from one or more page images using GPT-4o vision.
    Supports multi-page documents seamlessly.
    """

    if isinstance(images, str):
        images = [images]

    prompt = f"""
TASK:
You are an authoritative, 100% accurate Indian invoice and logistics document extraction engine.
Analyze all provided document pages with extreme visual precision and extract every relevant field into the exact JSON schema provided below.

CRITICAL DOCUMENT RULES — AVOID COMMON ERRORS:

1. INVOICE NUMBER vs REFERENCE NUMBER vs SHIPMENT NUMBER:
   - "invoice_number": The exact Tax Invoice Number (e.g. "2625111151791", "262511020877", "352311231346", "1196083354"). Strip any leading dot.
   - "reference_number": The Sales Order No / PO Ref / Order Reference (e.g. "2625204226", "2625027756", "0100449320").
   - NEVER swap invoice_number with reference_number, delivery_number, or shipment_number.

2. CONSIGNEE vs BUYER vs TABLE LABELS:
   - "consignee_name": The actual corporate or individual recipient name from "SHIP TO" / "ADDRESS OF DELIVERY" / "DELIVERY TO" / "CONSIGNEE".
     CRITICAL: NEVER extract generic table titles or code labels such as "ADDRESS OF DELIVERY", "SHIP TO CODE", "CUSTOMER CODE", or "SAME AS BILLED TO" as a consignee name!
     Example: If the header says "ADDRESS OF DELIVERY" followed by "MAJI HARDWARE", the consignee_name is "MAJI HARDWARE".
   - "buyer_name": The billed-to entity name from "BILLED TO" / "BILL TO" / "CUSTOMER". Strip prefixes like "CUSTOMER CODE 12345:".
   - Extract complete street address, state, state code, pincode, and GSTIN/PAN for both.

3. VEHICLE NUMBER — STRICT ACCURACY:
   - "vehicle_number": Indian commercial vehicle registration plate (e.g. "WB33C6016", "WB39A5858", "WB41B6273", "WB38B9916").
   - Normalize formatting: remove spaces and hyphens (e.g. "WB 33C 6016" -> "WB33C6016").
   - NEVER put a 15-character GSTIN (like 19AATFD1733C1ZH) or a phone number or shipment number here!
   - Leave "wheel_type" as "" (empty string). Our database is the authoritative source for wheel type.

4. DISPATCH & LOGISTICS IDENTIFIERS:
   - "delivery_number": Delivery Note / Delivery No / DO No (e.g. "101602700", "50900115", "100418376").
   - "shipment_number": Shipment No / Dispatch No (e.g. "2111091703", "2110876145", "DAC/23-24/01852").
   - "challan_number": ONLY extract if explicitly titled "Challan" or "Delivery Challan". If not labeled Challan, return "". Never derive it from the invoice number.
   - "destination": Town/site and pincode (e.g. "Purulia - 723148", "Birahimpur - 713123").
   - "destination_state": Valid Indian state (e.g. "West Bengal", "Jharkhand", "Bihar", "Odisha").

5. DRIVER INFORMATION:
   - Extract "driver_name", "driver_number" (phone), "driver_license" if printed anywhere on the invoice or delivery slip.
   - If not printed on the document, return "". Do not invent or fabricate driver information.

6. ITEM / MATERIAL DETAILS:
   - Extract all items with complete accuracy.
   - "description_of_product": Product name (e.g. "PSC: CONCRETO ADSTAR", "NUVOCO VISTAS PREMIUM SLAG CEMENT").
   - "hsn_code": HSN/SAC code (e.g. "25232940").
   - "quantity": Number of MT or units (e.g. "19.000", "25.00").
   - "bags": Number of bags if printed (otherwise "").
   - "uom": "MT", "BAGS", etc.
   - "rate": Price/rate per unit as printed. Preserve exact decimals.
   - "taxable_value": Taxable amount as printed. Preserve exact decimals.
   - Do NOT round values unless printed as rounded.

7. E-WAY BILL (EWB) DETAILS — VERY IMPORTANT:
   - Look carefully across all pages for the E-Way Bill section (often in a dedicated box, header, or footer).
   - "ewb_number": 11-15 digit numeric code (e.g. "89175663812", "881678650961").
   - "ewb_create_date": Generation date as DD/MM/YYYY.
   - "ewb_create_time": Generation time as HH:MM:SS.
   - "ewb_valid_date": Validity date as DD/MM/YYYY.
   - "ewb_valid_time": Validity time as HH:MM:SS.
   - If not present anywhere in the document, return "".

8. MULTI-PAGE INVOICES:
   - You have been provided with all pages of the document.
   - Inspect every page. Consolidate details into a single cohesive invoice record.
   - Do NOT duplicate items if headers/footers repeat across pages.

SCHEMA TO MATCH EXACTLY:
{json.dumps(target_schema, indent=2)}

Return ONLY a valid JSON object matching the schema.
"""

    user_content = [{"type": "text", "text": prompt}]
    for idx, b64_img in enumerate(images):
        user_content.append({
            "type": "text",
            "text": f"=== DOCUMENT PAGE {idx + 1} OF {len(images)} ==="
        })
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64_img}",
                "detail": "high"
            }
        })

    models_to_try = ["gpt-4o", "gpt-4o-mini"]
    max_retries = 3
    content = None

    for attempt in range(max_retries):
        model_name = models_to_try[0] if attempt < 2 else models_to_try[1]

        try:
            print(f"[AI EXTRACTOR] Attempt {attempt + 1}/{max_retries} requesting model '{model_name}' on {len(images)} page(s)...")
            response = client.chat.completions.create(
                model=model_name,
                temperature=0,
                timeout=60,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "user",
                        "content": user_content
                    }
                ]
            )
            content = response.choices[0].message.content
            print(f"GPT ({model_name}) VISION EXTRACTION SUCCESS:", content[:300], "...")
            break
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower() or "quota" in err_str.lower()
            print(f"[AI EXTRACTOR ERROR] Model '{model_name}' Attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt == max_retries - 1:
                if is_rate_limit:
                    raise ValueError("AI service is currently busy due to high traffic. Please try again in a moment.")
                raise ValueError(f"Failed AI vision extraction after {max_retries} attempts: {e}")

            if is_rate_limit and attempt == 0:
                print(f"[AI EXTRACTOR FALLBACK] Rate limit on {model_name}. Trying gpt-4o-mini...")
                time.sleep(1.0)
                continue

            wait_sec = (2 ** attempt) + random.uniform(0.5, 1.5)
            time.sleep(wait_sec)

    if not content:
        raise ValueError("Empty response from GPT vision extraction")

    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    if not (content.startswith("{") and content.endswith("}")):
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start:end + 1]

    extracted = json.loads(content)
    return extracted