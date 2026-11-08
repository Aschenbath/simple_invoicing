"""Resolve effective-dated sales TCS; saved documents keep their own rates."""

from decimal import Decimal

from fastapi import HTTPException

from src.models.tax_withholding_section import TaxWithholdingSection
from src.services.tax_withholding import suggest_withholding
from src.services.gst_tax_service import money


def is_sales_tcs(section):
    # Sl. No. 7–9 concern remittances, tours and licences, not sales of goods.
    return section.kind == "tcs" and section.legacy_code in {"206C(1)", "206C(1F)"}


def prepare_tcs(db, document, payload, company, ledger, on_date):
    section_id = payload.tcs_section_id
    if section_id is None:
        if payload.tcs_amount:
            raise HTTPException(400, "Choose a TCS section before entering a TCS amount")
        document.tcs_section_id = None
        document.tcs_section_ref = None
        document.tcs_base = None
        document.tcs_rate = 0
        document.tcs_base_amount = 0
        document.tcs_amount = 0
        return None
    if not getattr(company, "enable_tcs", False):
        raise HTTPException(400, "Enable TCS in company settings before collecting it")
    if getattr(payload, "voucher_type", "sales") != "sales":
        raise HTTPException(400, "TCS can only be collected on sales invoices")
    section = db.get(TaxWithholdingSection, section_id)
    if section is None or not is_sales_tcs(section):
        raise HTTPException(400, "Choose a TCS section for sales of goods")
    if section.effective_from > on_date or (section.effective_to and section.effective_to < on_date):
        raise HTTPException(400, "The TCS section is not valid on the document date")

    # Repricing an existing document with the same section retains its snapshot.
    # Selecting another version explicitly adopts that version's rate and base.
    if (document.tcs_section_id != section.id or document.ledger_id != ledger.id
            or document.ledger_pan != ledger.pan):
        document.tcs_section_id = section.id
        document.tcs_section_ref = section.section_ref
        document.tcs_base = section.base
        document.tcs_rate = suggest_withholding(section, 0, ledger.party_type, bool(ledger.pan))["rate"]
    if payload.tcs_amount is not None:
        return Decimal(str(payload.tcs_amount))
    if getattr(ledger, "tcs_declaration_received", False) and section.legacy_code == "206C(1)":
        return Decimal("0")
    return None


def copy_tcs_input(db, source, on_date):
    """Copy the user's collection, selecting the matching version for a new date."""
    if not source.tcs_section_id:
        return {}
    old = db.get(TaxWithholdingSection, source.tcs_section_id)
    candidates = db.query(TaxWithholdingSection).filter(
        TaxWithholdingSection.kind == "tcs",
        TaxWithholdingSection.legacy_code == old.legacy_code,
        TaxWithholdingSection.effective_from <= on_date,
        (TaxWithholdingSection.effective_to.is_(None) | (TaxWithholdingSection.effective_to >= on_date)),
    ).all()
    section = next((row for row in candidates if row.nature == old.nature), None)
    if section is None and len(candidates) == 1:
        section = candidates[0]
    if section is None and "timber" in old.nature.lower():
        section = next((row for row in candidates if "timber" in row.nature.lower()), None)
    if section is None:
        raise HTTPException(400, "No matching TCS section is available on the new document date")
    return {"tcs_section_id": section.id, "tcs_amount": float(source.tcs_amount)}


def credit_tcs(db, invoices, items):
    """Cumulative proportions keep partial returns exact, including the last paisa.

    GST line amounts remain untouched. A separate adjustment reverses the TCS
    invoice's document discount and round-off so a full return settles it exactly.
    """
    from sqlalchemy import func
    from src.models.credit_note import CreditNote, CreditNoteItem
    from src.services.invoice_discounts import invoice_discount_amount

    for invoice in invoices:
        if not invoice.tcs_section_id:
            continue
        gross = Decimal(str(invoice.taxable_amount)) + Decimal(str(invoice.total_tax_amount))
        if gross <= 0:
            continue
        before, prior_tcs, prior_adjustment, prior_base = db.query(
            func.coalesce(func.sum(CreditNoteItem.line_total), 0),
            func.coalesce(func.sum(CreditNoteItem.tcs_amount), 0),
            func.coalesce(func.sum(CreditNoteItem.invoice_adjustment_amount), 0),
            func.coalesce(func.sum(CreditNoteItem.tcs_base_amount), 0),
        ).join(CreditNote).filter(
            CreditNoteItem.invoice_id == invoice.id, CreditNote.status == "active",
        ).one()
        before, prior_tcs, prior_adjustment, prior_base = map(lambda x: Decimal(str(x)), (before, prior_tcs, prior_adjustment, prior_base))
        adjustment = Decimal(str(invoice.round_off_amount or 0)) - invoice_discount_amount(invoice)
        for item in items:
            if item["invoice_id"] != invoice.id:
                continue
            before = min(gross, before + item["line_total"])
            base_after = money(Decimal(str(invoice.tcs_base_amount)) * before / gross)
            item["tcs_base_amount"] = base_after - prior_base
            prior_base = base_after
            tcs_after = money(Decimal(str(invoice.tcs_amount)) * before / gross)
            adjustment_after = money(adjustment * before / gross)
            item["tcs_amount"] = tcs_after - prior_tcs
            item["invoice_adjustment_amount"] = adjustment_after - prior_adjustment
            prior_tcs, prior_adjustment = tcs_after, adjustment_after
