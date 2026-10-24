def fill_invoice_time(invoice_json):
    inv_details = invoice_json.setdefault("invoice_details", {})
    invoice_time = inv_details.get("invoice_time")

    if not invoice_time:
        ewb_time = (
            invoice_json.get("ewb_details", {}).get("ewb_create_time")
            or invoice_json.get("ewb_irn_details", {}).get("ewb_create_time")
            or ""
        )
        inv_details["invoice_time"] = ewb_time

    return invoice_json