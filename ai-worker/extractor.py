import base64
import json
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def extract_invoice_data(image_path, target_schema):
    """
    Directly extract structured invoice data from the image using GPT-4.1 vision.
    No OCR step required — the model reads the image natively.
    """

    with open(image_path, "rb") as img_file:
        base64_image = base64.b64encode(img_file.read()).decode("utf-8")

    prompt = f"""
TASK:
You are an expert invoice data extraction engine.
Look at the invoice image carefully and extract all data into the exact JSON schema provided.

IMPORTANT INVOICE STRUCTURE RULES:

1. Seller is the company issuing the invoice (usually at the top of the document).
2. Buyer details must come from the section labeled:
   - "BILLED TO" / "BILL TO"
3. Consignee details must come from the section labeled:
   - "SHIP TO" / "ADDRESS OF DELIVERY" / "DELIVERY ADDRESS"

4. Never confuse these sections:
   - Seller, Billed To, Delivery Address, Transporter

5. Transporter details must NOT be used as buyer or consignee details.
6. Buyer name is usually the first company/person name under BILLED TO.
7. Consignee name is usually the first name under DELIVERY ADDRESS.

DATA EXTRACTION RULES:

8. Return ONLY valid JSON — no markdown, no explanation.
9. Follow the schema exactly.
10. If any field is missing or not visible, return "" for that field.
11. Do not hallucinate or invent values not visible in the image.
12. Preserve numeric values exactly as visible in the image.

ADDRESS RULES:

13. Extract only valid 6-digit pincodes.
14. Do not mix addresses between buyer, consignee and transporter.
15. BILLED TO address = buyer address.
16. SHIP TO / ADDRESS OF DELIVERY / DELIVERY TO = consignee details and address.
17. Fix obvious visual OCR mistakes like "ITH FLOOR" → "11TH FLOOR".

TIME RULES:

18. Normalize time to HH:MM:SS format.
19. Replace "." with ":" in time values.

TAX RULES:

20. total_tax_amount = cgst_amount + sgst_amount.

TRANSPORT RULES:

21. If mode_of_transport is missing, use "Road".
22. If lorrey_receipt_number is missing, return "".
23. For challan_number: ONLY extract it if the word "Challan" or "Challan No" is explicitly visible in the image. Never derive it from the invoice number.
24. Pattern like "WB39B1080" is a Truck/Vehicle number. Put it in `vehicle_number`, NOT in `lorrey_receipt_number`. 
25. If `destination_state` is missing or implicit, derive it from the `destination` or `consignee_state` (e.g., if destination has 814154 or Mohanpur, output "Jharkhand"). Must output a valid Indian State name.

E-WAY BILL RULES:

26. Look carefully for any E-Way Bill / EWB section anywhere on the invoice (often at the bottom or in a small box).
27. ewb_number is a long numeric code (12-15 digits), labeled "E-Way Bill No.", "EWB No.", or "E-WayBill No."
28. ewb_create_date and ewb_create_time come from fields labeled "Generated On", "EWB Date", "Created On", or similar. Format date as DD/MM/YYYY and time as HH:MM:SS.
29. ewb_valid_date and ewb_valid_time come from fields labeled "Valid Till", "Valid Upto", "Validity". Format date as DD/MM/YYYY and time as HH:MM:SS.
30. If any EWB field is not present, return "" — do not guess.

NUMBER CLEANING RULES:

31. Remove any leading "." from numeric IDs. e.g. ".262511003283" → "262511003283", ".2014086270" → "2014086270".
32. Invoice numbers, reference numbers, shipment numbers must NEVER start with ".".

SCHEMA:
{json.dumps(target_schema, indent=2)}

Return ONLY valid JSON matching the schema exactly.
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}",
                            "detail": "high"
                        }
                    }
                ]
            }
        ]
    )

    content = response.choices[0].message.content
    print("GPT VISION EXTRACTION RESPONSE:", content[:300], "...")

    if not content:
        raise ValueError("Empty response from GPT vision extraction")

    content = content.strip()

    # Strip markdown code blocks if present
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    # Extract first valid JSON object
    if not (content.startswith("{") and content.endswith("}")):
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start:end + 1]

    return json.loads(content)