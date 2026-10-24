import re

def normalize_time(time_str):
    if not time_str:
        return ""
    time_str = time_str.strip().replace(".", ":")
    if re.match(r"^\d{2}:\d{2}$", time_str):
        return time_str + ":00"
    return time_str


def clean_number(num):
    if not num:
        return ""
    s = str(num).replace(",", "").replace("₹", "").replace("Rs.", "").strip()
    return re.sub(r"^\.+", "", s)


def normalize_date_format(date_str):
    if not date_str:
        return ""
    s = str(date_str).strip()
    # If YYYY-MM-DD or YYYY.MM.DD
    m_ymd = re.match(r"^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})", s)
    if m_ymd:
        yyyy, mm, dd = m_ymd.groups()
        return f"{int(dd):02d}/{int(mm):02d}/{yyyy}"
    # If DD.MM.YYYY or DD-MM-YYYY
    m_dmy = re.match(r"^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})", s)
    if m_dmy:
        dd, mm, yyyy = m_dmy.groups()
        return f"{int(dd):02d}/{int(mm):02d}/{yyyy}"
    return s


def clear_hallucinated_fields(invoice_json, ocr_text=""):
    """
    Hard guard: wipe fields that the AI should never invent.
    """
    if ocr_text:
        ocr_lower = ocr_text.lower()
        if "challan" not in ocr_lower:
            supply = invoice_json.get("supply_details", {})
            supply["challan_number"] = ""
    return invoice_json


def validate_invoice(invoice_json):
    warnings = []
    validation_meta = invoice_json.get("validation_meta", {})
    if not isinstance(validation_meta, dict):
        validation_meta = {"needs_manual_verification": False, "warnings": []}

    inv_details = invoice_json.setdefault("invoice_details", {})
    supply_details = invoice_json.setdefault("supply_details", {})
    buyer_details = invoice_json.setdefault("buyer_details", {})
    consignee_details = invoice_json.setdefault("consignee_details", {})
    tax_details = invoice_json.setdefault("tax_details", {})
    amount_summary = invoice_json.setdefault("amount_summary", {})
    ewb_details = invoice_json.setdefault("ewb_details", {})
    items = invoice_json.setdefault("items", [])

    # 1. Clean invoice number, reference number, shipment, delivery
    inv_no = clean_number(inv_details.get("invoice_number", ""))
    inv_details["invoice_number"] = inv_no

    ref_no = clean_number(inv_details.get("reference_number", ""))
    inv_details["reference_number"] = ref_no

    ship_no = clean_number(supply_details.get("shipment_number", ""))
    supply_details["shipment_number"] = ship_no

    del_no = clean_number(supply_details.get("delivery_number", ""))
    supply_details["delivery_number"] = del_no

    challan_no = clean_number(supply_details.get("challan_number", ""))
    # If challan number was copied directly from invoice or ref without reason
    if challan_no and (challan_no == inv_no or challan_no == ref_no):
        challan_no = ""
    supply_details["challan_number"] = challan_no

    # Fix invoice time
    inv_details["invoice_time"] = normalize_time(inv_details.get("invoice_time", ""))

    # Normalize dates
    inv_details["invoice_date"] = normalize_date_format(inv_details.get("invoice_date", ""))
    ewb_details["ewb_create_date"] = normalize_date_format(ewb_details.get("ewb_create_date", ""))
    ewb_details["ewb_valid_date"] = normalize_date_format(ewb_details.get("ewb_valid_date", ""))
    ewb_details["ewb_create_time"] = normalize_time(ewb_details.get("ewb_create_time", ""))
    ewb_details["ewb_valid_time"] = normalize_time(ewb_details.get("ewb_valid_time", ""))

    # 2. Normalize Vehicle Number — Anti-GSTIN / Anti-unrelated check
    raw_vehicle = supply_details.get("vehicle_number", "")
    if raw_vehicle:
        clean_vehicle = re.sub(r"[^A-Za-z0-9]", "", raw_vehicle).upper()
        # Check if it looks like a 15-character GSTIN (e.g. 19AATFD1733C1ZH)
        gstin_match = re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", clean_vehicle)
        if gstin_match:
            warnings.append(f"Discarded invalid vehicle number '{raw_vehicle}' because it matched a GSTIN format.")
            supply_details["vehicle_number"] = ""
        else:
            supply_details["vehicle_number"] = clean_vehicle
    else:
        warnings.append("Vehicle number is missing or could not be detected from document.")

    # Always ensure wheel_type is empty initially; database will populate it
    supply_details["wheel_type"] = ""

    # 3. Clean Consignee & Buyer names from generic header strings
    generic_names = [
        "ADDRESS OF DELIVERY", "SHIP TO CODE", "CUSTOMER CODE",
        "SAME AS ABOVE", "SAME AS BILLED TO", "DELIVERY ADDRESS",
        "SHIP TO", "CONSIGNEE", "BILLED TO", "BUYER"
    ]
    consignee_name = consignee_details.get("consignee_name", "").strip()
    buyer_name = buyer_details.get("buyer_name", "").strip()

    if consignee_name.upper() in generic_names:
        consignee_name = ""

    # Clean "CUSTOMER CODE 123456:" prefix from buyer name
    m_code = re.match(r"^CUSTOMER\s*CODE\s*[:\-]?\s*\d+\s*[:\-]?\s*(.*)$", buyer_name, re.I)
    if m_code and m_code.group(1).strip():
        buyer_name = m_code.group(1).strip()
    elif buyer_name.upper() in generic_names or re.match(r"^CUSTOMER\s*CODE\s*[:\-]?\s*\d+$", buyer_name, re.I):
        buyer_name = ""

    # Synchronize consignee name across both places if one is missing
    if not consignee_name and buyer_name:
        consignee_name = buyer_name
    elif not buyer_name and consignee_name:
        buyer_name = consignee_name

    consignee_details["consignee_name"] = consignee_name
    buyer_details["buyer_name"] = buyer_name

    # 4. Clean Seller Name for portal compatibility
    seller_name = invoice_json.get("seller_details", {}).get("seller_name", "").upper()
    if "NUVOCO" in seller_name or "NVCL" in seller_name:
        invoice_json["seller_details"]["seller_name"] = "NVCL"
    elif "NU VISTA" in seller_name or "NUVISTA" in seller_name or "NVL" in seller_name:
        invoice_json["seller_details"]["seller_name"] = "NVL"

    # 5. Clean item numbers (preserving exact decimals)
    has_quantity = False
    for item in items:
        item["rate"] = clean_number(item.get("rate", ""))
        item["taxable_value"] = clean_number(item.get("taxable_value", ""))
        qty_str = clean_number(item.get("quantity", ""))
        item["quantity"] = qty_str
        try:
            if float(qty_str) > 0:
                has_quantity = True
        except (ValueError, TypeError):
            pass

    if not has_quantity and items:
        warnings.append("Item quantity could not be parsed as a positive number.")

    # 6. Clean tax amounts
    tax_details["cgst_amount"] = clean_number(tax_details.get("cgst_amount", ""))
    tax_details["sgst_amount"] = clean_number(tax_details.get("sgst_amount", ""))
    tax_details["igst_amount"] = clean_number(tax_details.get("igst_amount", ""))

    # 7. Check critical fields
    if not inv_details.get("invoice_number"):
        warnings.append("Invoice Number was not found on document.")
    if not inv_details.get("invoice_date"):
        warnings.append("Invoice Date was not found on document.")

    validation_meta["warnings"] = warnings
    validation_meta["needs_manual_verification"] = len(warnings) > 0
    invoice_json["validation_meta"] = validation_meta

    return invoice_json