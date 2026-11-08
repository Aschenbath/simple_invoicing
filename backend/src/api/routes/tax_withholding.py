from datetime import date as Date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_active_company
from src.models.company import CompanyProfile
from src.db.session import get_db
from src.models.tax_withholding_section import TaxWithholdingSection
from src.models.user import User
from src.schemas.tax_withholding import TaxWithholdingSectionOut

router = APIRouter()


@router.get("/tax-withholding-sections", response_model=list[TaxWithholdingSectionOut])
def list_tax_withholding_sections(
    kind: str = Query("tds", pattern="^(tds|tcs)$"),
    on_date: Date = Query(default_factory=Date.today, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    sales_only: bool = False,
):
    """Return the TDS/TCS sections in force on the requested transaction date."""
    rows = (
        db.query(TaxWithholdingSection)
        .filter(
            TaxWithholdingSection.kind == kind,
            TaxWithholdingSection.effective_from <= on_date,
            (TaxWithholdingSection.effective_to.is_(None) | (TaxWithholdingSection.effective_to >= on_date)),
        )
        .order_by(TaxWithholdingSection.section_ref, TaxWithholdingSection.nature)
        .all()
    )
    if sales_only:
        from src.services.sales_tcs import is_sales_tcs
        rows = [row for row in rows if is_sales_tcs(row)]
    return rows


@router.get("/reports/tcs-collected")
def collected_tcs(
    tax_year: int = Query(..., ge=2025, le=2098),
    quarter: int | None = Query(None, ge=1, le=4),
    export_csv: bool = False,
    current_user: User = Depends(get_current_user),
    company: CompanyProfile = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    from csv import DictWriter
    from io import StringIO
    from fastapi import HTTPException
    from fastapi.responses import Response
    from src.services.tcs_report import tcs_report

    if company is None:
        raise HTTPException(400, "Select a company first")
    report = tcs_report(db, company.id, tax_year, quarter)
    if not export_csv:
        return report
    stream = StringIO()
    fields = ["document_number", "invoice_number", "date", "buyer", "buyer_pan", "section", "base", "rate", "tcs"]
    writer = DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in report["rows"]:
        # Spreadsheet programs must treat names and document numbers as text.
        writer.writerow({key: "'" + value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) else value for key, value in row.items()})
    return Response(stream.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="tcs-collected-{tax_year}.csv"',
    })
