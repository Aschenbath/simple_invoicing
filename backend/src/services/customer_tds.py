"""Customer TDS suggestions and immutable receipt snapshots."""

from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

from src.models.company import CompanyProfile
from src.models.tax_withholding_section import TaxWithholdingSection
from src.services.tax_withholding import suggest_withholding


def tds_options(sections, invoice, customer) -> list[dict]:
    day = invoice.invoice_date.date()
    return [
        {
            "id": section.id,
            "section_ref": section.section_ref,
            "nature": section.nature,
            "legacy_code": section.legacy_code,
            **suggest_withholding(section, invoice.taxable_amount or 0, customer.party_type, bool(customer.pan)),
        }
        for section in sections
        if section.kind == "tds" and section.effective_from <= day
        and (section.effective_to is None or section.effective_to >= day)
    ]


def allocation_tds_snapshot(db, payment, invoice, allocation, existing) -> dict:
    amount = Decimal(str(allocation.tds_amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount == 0:
        return {"tds_amount": amount}
    if not allocation.tds_section_id:
        raise HTTPException(status_code=400, detail="Select a TDS section for each deduction")

    # An edit to cash, notes or the amount deducted must not rewrite historical
    # tax data because a party's PAN or the rate catalogue has since changed.
    if existing and existing.tds_amount and existing.tds_section_id == allocation.tds_section_id:
        return {
            "tds_amount": amount,
            **{field: getattr(existing, field) for field in (
                "tds_section_id", "tds_section_ref", "tds_rate", "tds_base_amount",
            )},
        }

    company = db.get(CompanyProfile, payment.company_id) if payment.company_id else None
    if not company or not company.enable_customer_tds:
        raise HTTPException(status_code=400, detail="Enable customer TDS in company settings first")
    section = db.get(TaxWithholdingSection, allocation.tds_section_id)
    options = tds_options([section] if section else [], invoice, invoice.ledger)
    if not options:
        raise HTTPException(status_code=400, detail="TDS section is not valid on the invoice date")
    return {
        "tds_amount": amount,
        "tds_section_id": section.id,
        "tds_section_ref": section.section_ref,
        "tds_rate": options[0]["rate"],
        "tds_base_amount": invoice.taxable_amount or 0,
    }
