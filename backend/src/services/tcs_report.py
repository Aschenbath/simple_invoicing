"""TCS collected and credit reversals, from document snapshots only."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import func

from src.models.credit_note import CreditNote, CreditNoteItem
from src.models.invoice import Invoice
from src.services.company_access import company_scope
from src.services.gst_tax_service import money


def tcs_report(db, company_id, tax_year, quarter=None):
    start_month = 4 + ((quarter or 1) - 1) * 3
    start = datetime(tax_year + (start_month - 1) // 12, (start_month - 1) % 12 + 1, 1)
    end_month = start_month + (3 if quarter else 12)
    end = datetime(tax_year + (end_month - 1) // 12, (end_month - 1) % 12 + 1, 1)
    invoices = db.query(Invoice).filter(
        company_scope(Invoice.company_id, company_id), Invoice.status == "active",
        Invoice.voucher_type == "sales", Invoice.tcs_section_id.isnot(None),
        Invoice.invoice_date >= start, Invoice.invoice_date < end,
    ).order_by(Invoice.invoice_date, Invoice.id).all()
    rows = []

    def append(invoice, number, on_date, base, amount):
        rows.append({
            "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
            "document_number": number, "date": on_date.date().isoformat(),
            "buyer": invoice.ledger_name, "buyer_pan": invoice.ledger_pan,
            "section": invoice.tcs_section_ref, "base": money(Decimal(str(base))),
            "rate": Decimal(str(invoice.tcs_rate)), "tcs": money(Decimal(str(amount))),
        })

    for invoice in invoices:
        append(invoice, invoice.invoice_number, invoice.invoice_date, invoice.tcs_base_amount, invoice.tcs_amount)
    credits = db.query(CreditNote, Invoice, func.sum(CreditNoteItem.tcs_amount), func.sum(CreditNoteItem.tcs_base_amount)).join(
        CreditNoteItem, CreditNoteItem.credit_note_id == CreditNote.id,
    ).join(Invoice, Invoice.id == CreditNoteItem.invoice_id).filter(
        company_scope(CreditNote.company_id, company_id), company_scope(Invoice.company_id, company_id),
        CreditNote.status == "active", Invoice.status == "active", Invoice.tcs_section_id.isnot(None),
        CreditNote.credit_note_date >= start, CreditNote.credit_note_date < end,
    ).group_by(CreditNote.id, Invoice.id).order_by(CreditNote.credit_note_date, CreditNote.id).all()
    for note, invoice, tcs, base in credits:
        append(invoice, note.credit_note_number, note.credit_note_date, -base, -tcs)
    sections = {}
    for row in rows:
        section = sections.setdefault(row["section"], {"section": row["section"], "base": Decimal("0"), "tcs": Decimal("0")})
        section["base"] += row["base"]
        section["tcs"] += row["tcs"]
    return {"tax_year": tax_year, "quarter": quarter, "form": "27EQ" if tax_year < 2026 else "143",
            "rows": rows, "sections": list(sections.values()),
            "total_tcs": sum((row["tcs"] for row in rows), Decimal("0"))}
