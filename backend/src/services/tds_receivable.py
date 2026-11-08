from datetime import date, datetime, time
from decimal import Decimal

from src.models.buyer import Buyer
from src.models.invoice import Invoice
from src.models.payment import Payment, PaymentInvoiceAllocation
from src.schemas.tds_receivable import TdsReceivableReport
from src.services.company_access import company_scope


def build_tds_receivable(db, company_id: int, tax_year: int, quarter: int | None) -> TdsReceivableReport:
    """Tax years begin in April; credit (the invoice date) determines the quarter."""
    start_month = 4 + ((quarter or 1) - 1) * 3
    start = date(tax_year + (start_month > 12), (start_month - 1) % 12 + 1, 1)
    end_month = start_month + 3 if quarter else 16
    end = date(tax_year + (end_month > 12), (end_month - 1) % 12 + 1, 1)
    deductions = (
        db.query(PaymentInvoiceAllocation, Payment, Invoice, Buyer)
        .join(Payment, Payment.id == PaymentInvoiceAllocation.payment_id)
        .join(Invoice, Invoice.id == PaymentInvoiceAllocation.invoice_id)
        .join(Buyer, Buyer.id == Invoice.ledger_id)
        .filter(
            company_scope(Payment.company_id, company_id),
            company_scope(Invoice.company_id, company_id),
            company_scope(Buyer.company_id, company_id),
            Payment.status == "active", Payment.voucher_type == "receipt",
            PaymentInvoiceAllocation.tds_amount > 0,
            Invoice.invoice_date >= datetime.combine(start, time.min),
            Invoice.invoice_date < datetime.combine(end, time.min),
        )
        .order_by(Invoice.invoice_date, Invoice.id, Payment.date, PaymentInvoiceAllocation.id)
        .all()
    )
    rows = {}
    by_section = {}
    by_customer = {}
    for allocation, receipt, invoice, customer in deductions:
        amount = Decimal(str(allocation.tds_amount))
        row = rows.setdefault(invoice.id, {
            "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date.date(), "customer_id": customer.id,
            "customer_name": customer.name, "customer_pan": customer.pan,
            "deductions": [], "tds_amount": Decimal("0"),
        })
        row["tds_amount"] += amount
        row["deductions"].append({
            "receipt_id": receipt.id, "receipt_date": receipt.date.date(),
            "section_ref": allocation.tds_section_ref, "rate": allocation.tds_rate,
            "taxable_amount": allocation.tds_base_amount, "tds_amount": amount,
        })
        section = by_section.setdefault(allocation.tds_section_ref, {
            "label": allocation.tds_section_ref, "tds_amount": Decimal("0"),
        })
        section["tds_amount"] += amount
        customer_total = by_customer.setdefault(customer.id, {
            "label": customer.name, "customer_id": customer.id, "tds_amount": Decimal("0"),
        })
        customer_total["tds_amount"] += amount
    return TdsReceivableReport(
        tax_year=tax_year, quarter=quarter, rows=list(rows.values()),
        by_section=sorted(by_section.values(), key=lambda value: value["label"]),
        by_customer=sorted(by_customer.values(), key=lambda value: (value["label"], value["customer_id"])),
        total_tds=sum((row["tds_amount"] for row in rows.values()), Decimal("0")),
    )
