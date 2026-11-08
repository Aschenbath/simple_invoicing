from datetime import date

from pydantic import BaseModel


class TdsDeduction(BaseModel):
    receipt_id: int
    receipt_date: date
    section_ref: str
    rate: float
    taxable_amount: float
    tds_amount: float


class TdsReceivableRow(BaseModel):
    invoice_id: int
    invoice_number: str | None
    invoice_date: date
    customer_id: int
    customer_name: str
    customer_pan: str | None
    deductions: list[TdsDeduction]
    tds_amount: float


class TdsReceivableTotal(BaseModel):
    label: str
    customer_id: int | None = None
    tds_amount: float


class TdsReceivableReport(BaseModel):
    tax_year: int
    quarter: int | None
    rows: list[TdsReceivableRow]
    by_section: list[TdsReceivableTotal]
    by_customer: list[TdsReceivableTotal]
    total_tds: float
