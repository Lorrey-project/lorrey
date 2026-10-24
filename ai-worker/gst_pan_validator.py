import re

# GSTIN format validation
def is_valid_gstin(gstin):
    if not gstin:
        return False
    gstin_clean = re.sub(r"[^A-Za-z0-9]", "", str(gstin)).upper()
    gstin_pattern = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
    return bool(re.match(gstin_pattern, gstin_clean))


# PAN validation
def is_valid_pan(pan):
    if not pan:
        return False
    pan_clean = re.sub(r"[^A-Za-z0-9]", "", str(pan)).upper()
    pan_pattern = r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"
    return bool(re.match(pan_pattern, pan_clean))


# Extract PAN from GSTIN
def extract_pan_from_gstin(gstin):
    if not gstin:
        return ""
    gstin_clean = re.sub(r"[^A-Za-z0-9]", "", str(gstin)).upper()
    if len(gstin_clean) >= 12:
        candidate_pan = gstin_clean[2:12]
        if is_valid_pan(candidate_pan):
            return candidate_pan
    return ""


def validate_gst_pan(invoice_json):
    seller = invoice_json.setdefault("seller_details", {})
    buyer = invoice_json.setdefault("buyer_details", {})
    consignee = invoice_json.setdefault("consignee_details", {})

    # Normalize seller GST / PAN
    s_gst = re.sub(r"[^A-Za-z0-9]", "", str(seller.get("seller_gstin", ""))).upper()
    s_pan = re.sub(r"[^A-Za-z0-9]", "", str(seller.get("seller_pan", ""))).upper()
    if is_valid_gstin(s_gst):
        seller["seller_gstin"] = s_gst
        if not s_pan:
            seller["seller_pan"] = extract_pan_from_gstin(s_gst)
    if is_valid_pan(s_pan):
        seller["seller_pan"] = s_pan

    # Normalize buyer GST / PAN
    b_gst = re.sub(r"[^A-Za-z0-9]", "", str(buyer.get("buyer_gstin", ""))).upper()
    b_pan = re.sub(r"[^A-Za-z0-9]", "", str(buyer.get("buyer_pan", ""))).upper()
    if is_valid_gstin(b_gst):
        buyer["buyer_gstin"] = b_gst
        if not b_pan:
            buyer["buyer_pan"] = extract_pan_from_gstin(b_gst)
    if is_valid_pan(b_pan):
        buyer["buyer_pan"] = b_pan

    # Normalize consignee GST / PAN
    c_gst = re.sub(r"[^A-Za-z0-9]", "", str(consignee.get("consignee_gstin", ""))).upper()
    c_pan = re.sub(r"[^A-Za-z0-9]", "", str(consignee.get("consignee_pan", ""))).upper()
    if is_valid_gstin(c_gst):
        consignee["consignee_gstin"] = c_gst
        if not c_pan:
            consignee["consignee_pan"] = extract_pan_from_gstin(c_gst)
    elif not c_gst and buyer.get("buyer_gstin"):
        consignee["consignee_gstin"] = buyer["buyer_gstin"]
    if is_valid_pan(c_pan):
        consignee["consignee_pan"] = c_pan
    elif not c_pan and buyer.get("buyer_pan"):
        consignee["consignee_pan"] = buyer["buyer_pan"]

    invoice_json["seller_details"] = seller
    invoice_json["buyer_details"] = buyer
    invoice_json["consignee_details"] = consignee

    return invoice_json