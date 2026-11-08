import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.api.deps import get_active_company, get_current_user
from src.db.session import get_db
from src.models.company import CompanyProfile
from src.models.user import User
from src.schemas.tds_receivable import TdsReceivableReport
from src.services.tds_receivable import build_tds_receivable

router = APIRouter()


@router.get("", response_model=TdsReceivableReport)
def get_tds_receivable(
    tax_year: int = Query(..., ge=2025, le=2099),
    quarter: int | None = Query(None, ge=1, le=4),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    active_company: CompanyProfile = Depends(get_active_company),
):
    return build_tds_receivable(db, active_company.id, tax_year, quarter)


@router.get("/csv")
def export_tds_receivable(
    tax_year: int = Query(..., ge=2025, le=2099),
    quarter: int | None = Query(None, ge=1, le=4),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    active_company: CompanyProfile = Depends(get_active_company),
):
    report = build_tds_receivable(db, active_company.id, tax_year, quarter)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Customer", "PAN", "Invoice", "Invoice date", "Receipt date(s)", "Section(s)",
                     "Rate(s) (%)", "Taxable amount(s)", "Deduction amount(s)", "TDS amount"])
    for row in report.rows:
        writer.writerow([
            row.customer_name, row.customer_pan or "", row.invoice_number or str(row.invoice_id),
            row.invoice_date.isoformat(),
            "; ".join(d.receipt_date.isoformat() for d in row.deductions),
            "; ".join(d.section_ref for d in row.deductions),
            "; ".join(f"{d.rate:g}" for d in row.deductions),
            "; ".join(f"{d.taxable_amount:.2f}" for d in row.deductions),
            "; ".join(f"{d.tds_amount:.2f}" for d in row.deductions),
            f"{row.tds_amount:.2f}",
        ])
    writer.writerow([])
    writer.writerow(["Total TDS", f"{report.total_tds:.2f}"])
    for label, totals in (("Section", report.by_section), ("Customer", report.by_customer)):
        writer.writerow([])
        writer.writerow([label, "TDS amount"])
        for total in totals:
            writer.writerow([total.label, f"{total.tds_amount:.2f}"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tds_receivable_{tax_year}_{quarter or "all"}.csv"'},
    )
