import json
import base64
from openai import OpenAI

client = OpenAI()

def validate_invoice_with_gpt(image_path, extracted_json):

    with open(image_path, "rb") as img:
        base64_image = base64.b64encode(img.read()).decode("utf-8")

    prompt = f"""
Compare this invoice image with the extracted JSON.
Fix incorrect values if you are sure and fill missing ones if present in invoice.

Rules:
1. The buyer address must be exactly as shown in the invoice under "BILLED TO". If it is different, correct it.
2. The consignee address must be exactly as shown in the invoice under "ADDRESS OF DELIVERY". If it is different, correct it.
3. If the challan number is present in the invoice, fill it in the JSON. Do not leave it blank if it exists.
4. Only change these fields if you are certain from the invoice image.
5. Return ONLY valid JSON.

JSON:
{json.dumps(extracted_json)}
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role":"user",
                "content":[
                    {"type":"text","text":prompt},
                    {
                        "type":"image_url",
                        "image_url":{
                            "url":f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
    )

    content = response.choices[0].message.content
    print("GPT RESPONSE:", content)

    if not content:
        return extracted_json

    content = content.strip()

    # Remove markdown/code block wrappers if present
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    # Try to extract the first valid JSON object from the content
    if not (content.startswith("{") and content.endswith("}")):
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start:end+1]

    try:
        return json.loads(content)
    except Exception as e:
        print("JSON parse failed", e)
        print("Raw content:", content)
        return extracted_json