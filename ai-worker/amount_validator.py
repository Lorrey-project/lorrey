def clean_float(value):
    if value is None:
        return 0.0

    value = str(value).replace(",", "").replace("%", "").replace("₹", "").replace("Rs.", "").strip()

    if value == "":
        return 0.0

    try:
        return float(value)
    except:
        return 0.0


def validate_amounts(invoice_json):
    items = invoice_json.get("items", [])
    tax = invoice_json.get("tax_details", {})
    summary = invoice_json.get("amount_summary", {})

    if not items:
        return invoice_json

    taxable = sum(clean_float(item.get("taxable_value")) for item in items)

    # 1. CGST / SGST Rates and Amounts — PRESERVE PRINTED VALUES
    existing_cgst = clean_float(tax.get("cgst_amount"))
    existing_sgst = clean_float(tax.get("sgst_amount"))
    existing_igst = clean_float(tax.get("igst_amount"))

    cgst_rate_raw = clean_float(tax.get("cgst_rate"))
    sgst_rate_raw = clean_float(tax.get("sgst_rate"))
    igst_rate_raw = clean_float(tax.get("igst_rate"))

    # Only derive if tax amounts were completely empty in the invoice
    if existing_cgst == 0 and existing_sgst == 0 and existing_igst == 0:
        if igst_rate_raw > 0:
            tax["igst_amount"] = f"{(taxable * igst_rate_raw / 100):.2f}"
            tax["igst_rate"] = f"{igst_rate_raw}%"
        elif cgst_rate_raw > 0 or sgst_rate_raw > 0:
            c_rate = (cgst_rate_raw if cgst_rate_raw > 0 else 9) / 100
            s_rate = (sgst_rate_raw if sgst_rate_raw > 0 else 9) / 100
            tax["cgst_amount"] = f"{(taxable * c_rate):.2f}"
            tax["sgst_amount"] = f"{(taxable * s_rate):.2f}"
            tax["cgst_rate"] = f"{c_rate * 100}%"
            tax["sgst_rate"] = f"{s_rate * 100}%"

    # 2. Total Tax Amount
    total_tax_raw = clean_float(summary.get("total_tax_amount"))
    if total_tax_raw == 0:
        c_amt = clean_float(tax.get("cgst_amount"))
        s_amt = clean_float(tax.get("sgst_amount"))
        i_amt = clean_float(tax.get("igst_amount"))
        calc_tax = c_amt + s_amt + i_amt
        if calc_tax > 0:
            summary["total_tax_amount"] = f"{calc_tax:.2f}"

    # 3. Net Payable
    net_payable_raw = clean_float(summary.get("net_payable"))
    if net_payable_raw == 0 and taxable > 0:
        tot_tax = clean_float(summary.get("total_tax_amount"))
        summary["net_payable"] = f"{(taxable + tot_tax):.2f}"

    invoice_json["tax_details"] = tax
    invoice_json["amount_summary"] = summary

    return invoice_json