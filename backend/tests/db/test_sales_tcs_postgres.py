"""Sales TCS through PostgreSQL and the restricted shared-hosting app role."""
import csv
import importlib
from io import StringIO
from decimal import Decimal

import pytest
from sqlalchemy import text

from src.core.config import settings
from src.core.validation import GSTIN_ALPHABET, is_valid_gstin_checksum
from src.models.invoice import Invoice
from src.services.invoice_discounts import invoice_discount_amount
from test_quotation_bounds_postgres import tenant  # noqa: F401
from test_quotation_convert_postgres import app_db, deployment, signed_in, _seed_company  # noqa: F401

pytestmark = pytest.mark.skipif(not settings.DATABASE_URL.startswith("postgres"), reason="requires PostgreSQL")


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


@pytest.fixture
def tcs(tenant, app_db):
    buyer_gst = next("27AABNV5432F1Z" + c for c in GSTIN_ALPHABET if is_valid_gstin_checksum("27AABNV5432F1Z" + c))
    with app_db.owner_engine.begin() as conn:
        importlib.import_module("migrations.20261107000001_add_tax_withholding_foundation").up(conn)
        conn.execute(text("UPDATE company_profiles SET enable_tcs=true, gst='27ABCDE1234F1Z0' WHERE id=:id"), {"id": tenant["company"]})
        conn.execute(text("UPDATE buyers SET pan='AABNV5432F', gst=:gst WHERE id=:id"), {"id": tenant["ledger"], "gst": buyer_gst})
        conn.execute(text("UPDATE products SET hsn_sac='7204' WHERE id=:id"), {"id": tenant["product"]})
    return tenant


def section(tcs, when="2026-04-15", nature="Sale of scrap"):
    rows = ok(tcs["client"].get("/api/tax-withholding-sections", params={"kind": "tcs", "date": when, "sales_only": True}))
    assert all(row["legacy_code"] in {"206C(1)", "206C(1F)"} for row in rows)
    return next(row for row in rows if row["nature"] == nature)


def payload(tcs, **extra):
    return {"ledger_id": tcs["ledger"], "invoice_date": "2026-04-15", "tcs_section_id": section(tcs)["id"],
            "items": [{"product_id": tcs["product"], "quantity": 1, "unit_price": 100000}], **extra}


def create(tcs, **extra):
    return ok(tcs["client"].post("/api/invoices/", json=payload(tcs, **extra)))


def note(tcs, invoice, **extra):
    return ok(tcs["client"].post("/api/credit-notes/", json={
        "ledger_id": tcs["ledger"], "invoice_ids": [invoice["id"]], "credit_note_type": "return",
        "credit_note_date": "2026-04-20", "items": [{"invoice_id": invoice["id"], "invoice_item_id": invoice["items"][0]["id"], "quantity": 1}], **extra,
    }), 201)


@pytest.mark.parametrize("when,rate,amount,ref", [
    ("2026-03-25", 1, 1180, "206C(1)"), ("2026-03-31", 1, 1180, "206C(1)"),
    ("2026-04-01", 2, 2360, "394(1)"), ("2026-04-15", 2, 2360, "394(1)"),
])
def test_scrap_and_effective_date_boundary(tcs, when, rate, amount, ref):
    invoice = create(tcs, invoice_date=when, tcs_section_id=section(tcs, when)["id"])
    assert invoice["taxable_amount"] == 100000
    assert invoice["total_tax_amount"] == 18000
    assert invoice["cgst_amount"] == invoice["sgst_amount"] == 9000
    assert invoice["igst_amount"] == 0
    assert invoice["tcs_base_amount"] == 118000
    assert invoice["tcs_rate"] == rate
    assert invoice["tcs_amount"] == amount
    assert invoice["total_amount"] == 118000 + amount
    assert ref in invoice["tcs_section_ref"]


def test_disabled_and_purchase_reject_tcs_but_ordinary_totals_are_unchanged(tcs, app_db):
    response = tcs["client"].post("/api/invoices/", json=payload(tcs, voucher_type="purchase"))
    assert response.status_code == 400
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE company_profiles SET enable_tcs=false"))
    response = tcs["client"].post("/api/invoices/", json=payload(tcs))
    assert response.status_code == 400
    ordinary = create(tcs, tcs_section_id=None)
    assert ordinary["total_amount"] == 118000 and ordinary["tcs_amount"] == 0


@pytest.mark.parametrize("discount,base_kind,base,amount,total,round_off", [
    (1000, "gross", 117000, 2340, 119340, 0),
    (1000, "taxable", 99000, 1980, 118980, 0),
    (0.51, "gross", 117999.49, 2359.99, 120359, -0.48),
    (999999, "gross", 0, 0, 0, 0),
])
def test_discount_base_round_off_and_inverse(tcs, app_db, discount, base_kind, base, amount, total, round_off):
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE tax_withholding_sections SET base=:base WHERE id=:id"), {"base": base_kind, "id": section(tcs)["id"]})
    invoice = create(tcs, discount_type="net", discount_value=discount, apply_round_off=True)
    assert (invoice["tcs_base_amount"], invoice["tcs_amount"], invoice["total_amount"], invoice["round_off_amount"]) == (base, amount, total, round_off)
    with app_db.OwnerSession() as db:
        assert invoice_discount_amount(db.get(Invoice, invoice["id"])) == Decimal(str(min(discount, 118000)))


def test_no_pan_declaration_override_and_saved_snapshot(tcs, app_db):
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE buyers SET pan=NULL, gst=NULL"))
    no_pan = create(tcs)
    assert no_pan["tcs_rate"] == 5 and no_pan["tcs_amount"] == 5900
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE buyers SET tcs_declaration_received=true"))
    assert create(tcs)["tcs_amount"] == 0
    overridden = create(tcs, tcs_amount=123.45)
    assert overridden["tcs_amount"] == 123.45
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE tax_withholding_sections SET rate_other=9, rate_no_pan=18, base='taxable'"))
    saved = ok(tcs["client"].get(f"/api/invoices/{overridden['id']}"))
    assert saved["tcs_rate"] == 5 and saved["tcs_base_amount"] == 118000 and saved["tcs_amount"] == 123.45
    edited = ok(tcs["client"].put(f"/api/invoices/{overridden['id']}", json=payload(tcs, tcs_amount=123.45)))
    assert edited["tcs_rate"] == 5 and edited["tcs_base_amount"] == 118000


@pytest.mark.parametrize("fields", [{"tcs_amount": -1}, {"tcs_amount": 100000000}, {"tcs_amount": "NaN"}, {"tcs_section_id": -1}])
def test_invalid_amounts_are_rejected(tcs, fields):
    assert tcs["client"].post("/api/invoices/", json=payload(tcs, **fields)).status_code == 422


def test_section_validation_and_storage_overflow(tcs):
    assert tcs["client"].post("/api/invoices/", json=payload(tcs, invoice_date="2026-03-25")).status_code == 400
    rows = ok(tcs["client"].get("/api/tax-withholding-sections", params={"kind": "tcs", "date": "2026-04-15"}))
    tour = next(row for row in rows if row["legacy_code"] == "206C(1G)")
    assert tcs["client"].post("/api/invoices/", json=payload(tcs, tcs_section_id=tour["id"])).status_code == 400
    assert tcs["client"].post("/api/invoices/", json=payload(tcs, tcs_amount=99999999.99)).status_code == 400


@pytest.mark.parametrize("discount,rounded", [(0, False), (0.51, True), (1000, False)])
def test_full_and_partial_credit_settle_tcs_exactly(tcs, discount, rounded):
    invoice = create(tcs, items=[{"product_id": tcs["product"], "quantity": 3, "unit_price": 33333.33}], discount_type="net", discount_value=discount, apply_round_off=rounded)
    credits = [note(tcs, invoice) for _ in range(3)]
    assert sum(Decimal(str(c["tcs_amount"])) for c in credits) == Decimal(str(invoice["tcs_amount"]))
    assert sum(Decimal(str(c["total_amount"])) for c in credits) == Decimal(str(invoice["total_amount"]))
    saved = ok(tcs["client"].get(f"/api/invoices/{invoice['id']}"))
    assert saved["remaining_amount"] == 0 and saved["credit_status"] == "fully_credited"
    report = ok(tcs["client"].get("/api/reports/tcs-collected", params={"tax_year": 2026}))
    assert report["sections"][0]["base"] == 0 and report["total_tcs"] == 0


def test_quotation_conversion_and_invoice_duplicate_copy_tcs(tcs):
    body = payload(tcs)
    body.pop("invoice_date")
    body["quotation_date"] = "2026-04-15"
    quote = ok(tcs["client"].post("/api/quotations/", json=body))
    assert quote["total_amount"] == 120360
    draft = ok(tcs["client"].get(f"/api/quotations/{quote['id']}/conversion-draft"))["invoice"]
    assert draft["tcs_section_id"] == quote["tcs_section_id"] and draft["tcs_amount"] == 2360
    invoice = ok(tcs["client"].post(f"/api/quotations/{quote['id']}/convert", json=draft))
    duplicate = ok(tcs["client"].post(f"/api/invoices/{invoice['id']}/duplicate"))
    duplicate = ok(tcs["client"].get(f"/api/invoices/{duplicate['id']}"))
    assert invoice["total_amount"] == duplicate["total_amount"] == 120360
    assert duplicate["tcs_amount"] == 2360


def test_report_quarters_sections_credit_reversal_csv_and_tenant_scope(tcs, app_db, signed_in):
    invoice = create(tcs)
    create(tcs, invoice_date="2026-07-01", tcs_amount=100)
    note(tcs, invoice)
    client = tcs["client"]
    report = ok(client.get("/api/reports/tcs-collected", params={"tax_year": 2026, "quarter": 1}))
    assert report["total_tcs"] == 0 and len(report["rows"]) == 2
    assert report["sections"][0]["tcs"] == 0 and report["form"] == "143"
    assert report["rows"][0]["buyer_pan"] == "AABNV5432F"
    assert ok(client.get("/api/reports/tcs-collected", params={"tax_year": 2026}))["total_tcs"] == 100
    exported = client.get("/api/reports/tcs-collected", params={"tax_year": 2026, "quarter": 1, "export_csv": True})
    assert exported.status_code == 200 and "text/csv" in exported.headers["content-type"]
    assert [Decimal(row["tcs"]) for row in csv.DictReader(StringIO(exported.text))] == [Decimal("2360"), Decimal("-2360")]
    from src.models.global_settings import GlobalSettings
    with app_db.OwnerSession() as db:
        db.merge(GlobalSettings(id=1, max_companies=3))
        db.commit()
    _seed_company(client, signed_in, app_db, "other@example.com", "Other Company", "OTHER")
    assert ok(client.get("/api/reports/tcs-collected", params={"tax_year": 2026}))["rows"] == []


def test_gst_reports_are_unchanged_by_tcs(tcs):
    client = tcs["client"]
    invoice = create(tcs, tcs_section_id=None, discount_type="net", discount_value=1000)
    period = {"from_date": "2026-04-01", "to_date": "2026-04-30"}
    before = ok(client.get("/api/ledgers/tax-ledger/gstr3b/worksheet", params=period))
    export_before = ok(client.get("/api/ledgers/tax-ledger/gstr1/export-json", params=period))
    updated = ok(client.put(f"/api/invoices/{invoice['id']}", json=payload(tcs, discount_type="net", discount_value=1000)))
    after = ok(client.get("/api/ledgers/tax-ledger/gstr3b/worksheet", params=period))
    export_after = ok(client.get("/api/ledgers/tax-ledger/gstr1/export-json", params=period))
    assert before == after
    original = export_before["b2b"][0]["inv"][0]
    changed = export_after["b2b"][0]["inv"][0]
    assert original["itms"] == changed["itms"]
    assert changed["val"] == updated["total_amount"] == 119340


def test_documents_and_downstream_invoice_values(tcs, app_db, monkeypatch):
    from types import SimpleNamespace
    from src.models.company import CompanyProfile
    from src.models.credit_note import CreditNote
    from src.models.product import Product
    from src.api.routes.email import _jinja_env
    from src.services.pdf_templates import _build_invoice_html, _build_credit_note_html
    from src.services.pdf_templates.tcs import tcs_label
    from src.services.eway_bill_service import generate_eway_bill_json
    from src.schemas.eway_bill import EwayBillFormData
    from src.services.marketplace.posting import build_posting_report

    invoice = create(tcs)
    credit = note(tcs, invoice)
    with app_db.OwnerSession() as db:
        stored = db.get(Invoice, invoice["id"])
        products = [db.get(Product, tcs["product"])]
        html = _build_invoice_html(stored, products)
        assert "TCS @ 2% (s.394(1) Sl. No. 4)" in html and "2,360.00" in html
        assert html.index("TCS @ 2%") < html.index('class="invoice-sheet__total-value"')
        credit_html = _build_credit_note_html(db.get(CreditNote, credit["id"]), [stored], products, db.get(CompanyProfile, tcs["company"]), stored.ledger)
        assert "TCS reversed" in credit_html and "2,360.00" in credit_html
        email = _jinja_env.get_template("invoice_email.html").render(
            company_name="Seller", invoice_number="INV-1", invoice_date="15 Apr 2026", buyer_name="Buyer",
            total_amount="120,360.00", items_count=1, tcs_label=tcs_label(stored), tcs_amount="2,360.00",
        )
        assert "TCS @ 2%" in email and email.index("TCS @") < email.index("Total amount")
        form = EwayBillFormData(seller_state_code="27", buyer_state_code="27", seller_pincode="400001", buyer_pincode="400002", transaction_type="1", sub_supply_type="1", transport_mode="1")
        bill = generate_eway_bill_json(stored, stored.items, {products[0].id: products[0]}, form)
        assert bill["billLists"][0]["totInvValue"] == 120360
        assert bill["billLists"][0]["OthValue"] == 2360
        report = build_posting_report(SimpleNamespace(items=[], currency_code="INR"), stored)
        assert Decimal(report["total_amount"]) == 120360 and Decimal(report["tax_amount"]) == 18000
    monkeypatch.setattr(settings, "SHARE_LINKS_ENABLED", True)
    share = ok(tcs["client"].post("/api/share/", json={"resource_type": "invoice", "resource_id": invoice["id"]}))
    page = tcs["client"].get(f"/s/{share['token']}")
    assert page.status_code == 200 and "TCS @ 2%" in page.text and "2,360.00" in page.text
    ledgers = ok(tcs["client"].get("/api/ledgers/", params={"include_balance": True}))
    assert ledgers["items"][0]["balance"] == 0


def test_settings_and_declaration_round_trip_and_default_off(tenant):
    client = tenant["client"]
    company = ok(client.get("/api/company/"))
    assert company["enable_tcs"] is False
    company["enable_tcs"] = True
    assert ok(client.put("/api/company/", json=company))["enable_tcs"] is True
    buyer = ok(client.get(f"/api/ledgers/{tenant['ledger']}"))
    assert buyer["tcs_declaration_received"] is False
    buyer["tcs_declaration_received"] = True
    assert ok(client.put(f"/api/ledgers/{tenant['ledger']}", json=buyer))["tcs_declaration_received"] is True


def test_tcs_migration_defaults_up_down_and_reapply(tenant, app_db):
    migration = importlib.import_module("migrations.20261108000001_add_sales_tcs")
    with app_db.owner_engine.connect() as conn:
        transaction = conn.begin()
        try:
            migration.down(conn)
            migration.down(conn)
            migration.up(conn)
            migration.up(conn)
            assert conn.execute(text("SELECT enable_tcs FROM company_profiles WHERE id=:id"), {"id": tenant["company"]}).scalar_one() is False
            assert conn.execute(text("SELECT tcs_declaration_received FROM buyers WHERE id=:id"), {"id": tenant["ledger"]}).scalar_one() is False
        finally:
            transaction.rollback()


def test_cancelled_credit_restores_balance_and_tcs_can_be_reversed_again(tcs):
    invoice = create(tcs)
    credit = note(tcs, invoice)
    change = tcs["client"].put(f"/api/invoices/{invoice['id']}", json=payload(tcs, tcs_amount=100))
    assert change.status_code == 400 and "credit notes" in change.text
    cancelled = tcs["client"].post(f"/api/credit-notes/{credit['id']}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    saved = ok(tcs["client"].get(f"/api/invoices/{invoice['id']}"))
    assert saved["remaining_amount"] == 120360
    assert note(tcs, invoice)["tcs_amount"] == 2360


def test_dashboard_and_analytics_keep_invoice_totals_and_exclude_tcs_from_product_revenue(tcs):
    create(tcs, discount_type="net", discount_value=1000)
    client = tcs["client"]
    dashboard = ok(client.get("/api/dashboard/metrics"))
    assert dashboard["sales"]["total_sales"] == 119340
    assert dashboard["charts"]["top_products"][0]["revenue"] == 117000
    period = {"from_date": "2026-04-01", "to_date": "2026-04-30"}
    monthly = ok(client.get("/api/analytics/sales-by-month", params=period))
    assert monthly["rows"][0]["total_sales"] == 119340
    assert monthly["rows"][0]["discount_given"] == 1000
