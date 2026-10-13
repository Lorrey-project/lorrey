import re


def clean_address(address):
    if not address:
        return ""

    # normalize commas and spaces
    address = re.sub(r"\s+", " ", address)
    address = address.replace(" ,", ",").strip()

    parts = [p.strip() for p in address.split(",")]

    # remove duplicates
    seen = set()
    cleaned = []

    for part in parts:
        key = part.lower()
        if key not in seen:
            cleaned.append(part)
            seen.add(key)

    return ", ".join(cleaned)


def extract_pincode(address):
    match = re.search(r"\b\d{6}\b", address)
    return match.group(0) if match else ""


def validate_addresses(invoice_json):

    buyer = invoice_json.get("buyer_details", {})
    consignee = invoice_json.get("consignee_details", {})

    buyer_addr = clean_address(buyer.get("buyer_address", ""))
    consignee_addr = clean_address(consignee.get("consignee_address", ""))

    buyer["buyer_address"] = buyer_addr
    consignee["consignee_address"] = consignee_addr

    # extract pincode if missing
    if not buyer.get("buyer_pincode"):
        buyer["buyer_pincode"] = extract_pincode(buyer_addr)

    # Normalize addresses
    invoice_json["buyer_details"] = buyer
    invoice_json["consignee_details"] = consignee

    return invoice_json