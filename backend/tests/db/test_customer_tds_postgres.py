"""Customer TDS through the API, on PostgreSQL in both deployment modes."""

import csv
import importlib.util
from decimal import Decimal
from io import StringIO
from pathlib import Path

import pytest
from sqlalchemy import text

from src.core.config import settings
from src.services.invoice_payments import open_amounts_by_ledger
from test_quotation_bounds_postgres import tenant  # noqa: F401
from test_quotation_convert_postgres import _seed_company, app_db, deployment, signed_in  # noqa: F401

pytestmark = pytest.mark.skipif(not settings.DATABASE_URL.startswith("postgres"), reason="requires PostgreSQL")

PERIOD = {"from_date": "2026-04-01", "to_date": "2026-09-30"}


def _migration(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[2] / "migrations" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


@pytest.fixture
def customer(tenant, app_db):
    client = tenant["client"]
    profile = _ok(client.get("/api/company/"))
    assert profile["enable_customer_tds"] is False
    _ok(client.put("/api/company/", json={**profile, "enable_customer_tds": True}))
    ledger = _ok(client.get(f"/api/ledgers/{tenant['ledger']}"))
    _ok(client.put(f"/api/ledgers/{tenant['ledger']}", json={**ledger, "pan": "ABCDE1234F", "party_type": "company"}))
    with app_db.owner_engine.begin() as conn:
        _migration("20261107000001_add_tax_withholding_foundation").up(conn)
    return tenant


def _invoice(customer, invoice_date="2026-04-01", price=100000):
    return _ok(customer["client"].post("/api/invoices/", json={
        "ledger_id": customer["ledger"], "invoice_date": invoice_date,
        "voucher_type": "sales", "apply_round_off": False,
        "items": [{"product_id": customer["untaxed"], "quantity": 1, "unit_price": price, "gst_rate": 18}],
    }))


def _options(customer, invoice):
    rows = _ok(customer["client"].get(f"/api/ledgers/{customer['ledger']}/unpaid-invoices"))
    return next(row for row in rows if row["id"] == invoice["id"])["tds_options"]


def _professional(customer, invoice):
    return next(option for option in _options(customer, invoice) if option["legacy_code"] == "194J" and option["rate"] == 10)


def _receipt(customer, invoice, *, cash=108000, tds=10000, section=None, **fields):
    section = section or _professional(customer, invoice)["id"]
    return customer["client"].post("/api/payments/", json={
        "ledger_id": customer["ledger"], "voucher_type": "receipt", "amount": cash, "date": "2026-04-15",
        "invoice_allocations": [{"invoice_id": invoice["id"], "allocated_amount": cash, "tds_amount": tds, "tds_section_id": section}],
        **fields,
    })


def _report(customer, year=2026, quarter=None):
    return _ok(customer["client"].get("/api/tds-receivable", params={"tax_year": year, **({"quarter": quarter} if quarter else {})}))


@pytest.mark.parametrize("account_type", ["cash", "bank"])
def test_cash_plus_tds_settles_invoice_and_ledger_but_only_cash_reaches_account_and_day_book(customer, app_db, account_type):
    client = customer["client"]
    invoice = _invoice(customer)
    assert invoice["total_amount"] == 118000
    account = _ok(client.post("/api/company-accounts/", json={"account_type": account_type, "display_name": "Receipts", "opening_balance": 0}))
    receipt = _ok(_receipt(customer, invoice, account_id=account["id"]))
    assert receipt["amount"] == 108000
    saved = receipt["invoice_allocations"][0]
    assert (saved["tds_amount"], saved["tds_base_amount"], saved["tds_rate"]) == (10000, 100000, 10)
    paid = _ok(client.get(f"/api/invoices/{invoice['id']}"))
    assert (paid["payment_status"], paid["remaining_amount"], paid["tds_amount"]) == ("paid", 0, 10000)
    for key in ("total_amount", "taxable_amount", "total_tax_amount", "cgst_amount", "sgst_amount", "igst_amount"):
        assert paid[key] == invoice[key]
    assert not _ok(client.get("/api/invoices/dues"))["items"]
    assert _ok(client.get(f"/api/ledgers/{customer['ledger']}/unpaid-invoices")) == []
    statement = _ok(client.get(f"/api/ledgers/{customer['ledger']}/statement", params=PERIOD))
    assert statement["closing_balance"] == 0
    tds_entries = [row for row in statement["entries"] if row["entry_type"] == "tds"]
    assert len(tds_entries) == 1 and tds_entries[0]["credit"] == 10000
    assert saved["tds_section_ref"] in tds_entries[0]["particulars"]
    ledgers = _ok(client.get("/api/ledgers/", params={"sort": "balance_desc"}))["items"]
    assert next(row for row in ledgers if row["id"] == customer["ledger"])["balance"] == 0
    day_book = _ok(client.get("/api/ledgers/day-book", params=PERIOD))
    assert day_book["total_credit"] == 108000
    assert not any(row["entry_type"] == "tds" for row in day_book["entries"])
    payments = _ok(client.get("/api/payments/"))
    assert sum(row["amount"] for row in payments if row["account_id"] == account["id"]) == 108000
    with app_db.OwnerSession() as db:
        assert open_amounts_by_ledger(db, [customer["ledger"]], company_id=customer["company"]) == {customer["ledger"]: (0, 0)}
    later = _ok(client.get(f"/api/ledgers/{customer['ledger']}/statement", params={"from_date": "2026-10-01", "to_date": "2026-10-31"}))
    assert later["opening_balance"] == 0


def test_statement_csv_pdf_and_public_share_include_separate_tds_credit(customer):
    client = customer["client"]
    _ok(_receipt(customer, _invoice(customer)))
    csv_response = client.get(f"/api/ledgers/{customer['ledger']}/statement/csv", params=PERIOD)
    assert csv_response.status_code == 200
    rows = list(csv.reader(StringIO(csv_response.text.lstrip("\ufeff"))))
    deduction = next(row for row in rows if len(row) > 1 and row[1] == "TDS")
    assert deduction[4:6] == ["", "10000.00"]
    link = _ok(client.post("/api/share/", json={"resource_type": "ledger_statement", "resource_id": customer["ledger"], **PERIOD}))
    page = client.get(f"/s/{link['token']}")
    assert page.status_code == 200
    assert "0.00 Dr" in page.text
    document = client.get(f"/s/{link['token']}/document.html")
    assert document.status_code == 200
    assert "TDS deducted, s.393(1) Sl. No. 6(iii)" in document.text
    assert "10,000.00" in document.text
    pdf = client.get(f"/api/ledgers/{customer['ledger']}/statement/pdf", params=PERIOD)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


@pytest.mark.parametrize("cash,tds", [(108000, 10000.01), (118000, 1)])
def test_over_settlement_is_rejected_without_leaving_a_receipt(customer, cash, tds):
    response = _receipt(customer, _invoice(customer), cash=cash, tds=tds)
    assert response.status_code == 400 and "remaining" in response.json()["detail"]
    assert _ok(customer["client"].get("/api/payments/")) == []
    assert _report(customer)["rows"] == []


def test_cash_allocations_must_fit_receipt_even_with_tds(customer):
    invoice = _invoice(customer)
    response = _receipt(customer, invoice, amount=107999)
    assert response.status_code == 400 and "Allocated total" in response.json()["detail"]


def test_tds_requires_invoice_and_section_and_is_not_supported_on_supplier_payments(customer):
    client = customer["client"]
    invoice = _invoice(customer)
    section = _professional(customer, invoice)["id"]
    for allocation in (
        {"invoice_id": invoice["id"], "allocated_amount": 108000, "tds_amount": 10000},
        {"invoice_id": 999999, "allocated_amount": 108000, "tds_amount": 10000, "tds_section_id": section},
    ):
        response = _receipt(customer, invoice, section=section, invoice_allocations=[allocation])
        assert response.status_code in (400, 404)
    purchase = _ok(client.post("/api/invoices/", json={
        "ledger_id": customer["ledger"], "voucher_type": "purchase", "invoice_date": "2026-04-01",
        "items": [{"product_id": customer["untaxed"], "quantity": 1, "unit_price": 118000}],
    }))
    response = _receipt(customer, purchase, section=section, voucher_type="payment")
    assert response.status_code == 400 and "customer receipts" in response.json()["detail"]


def test_removing_all_allocations_and_no_tds_receipts_preserve_cash_behavior(customer):
    client = customer["client"]
    invoice = _invoice(customer)
    receipt = _ok(_receipt(customer, invoice))
    _ok(client.put(f"/api/payments/{receipt['id']}", json={"voucher_type": "receipt", "amount": 108000, "invoice_allocations": []}))
    assert _report(customer)["rows"] == []
    assert _ok(client.get(f"/api/invoices/{invoice['id']}"))["remaining_amount"] == 118000
    _ok(client.delete(f"/api/payments/{receipt['id']}"))
    _ok(_receipt(customer, invoice, tds=0, cash=118000))
    assert _ok(client.get(f"/api/invoices/{invoice['id']}"))["payment_status"] == "paid"
    assert _report(customer)["rows"] == []
    entries = _ok(client.get(f"/api/ledgers/{customer['ledger']}/statement", params=PERIOD))["entries"]
    assert [row["entry_type"] for row in entries] == ["invoice", "payment"]


def test_edit_omit_remove_and_cancel_tds(customer, app_db):
    client = customer["client"]
    invoice = _invoice(customer)
    receipt = _ok(_receipt(customer, invoice))
    allocation = receipt["invoice_allocations"][0]
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("UPDATE tax_withholding_sections SET rate_other = 9, section_ref = 'changed' WHERE id = :id"), {"id": allocation["tds_section_id"]})
        conn.execute(text("UPDATE buyers SET pan = NULL WHERE id = :id"), {"id": customer["ledger"]})
    omitted = _ok(client.put(f"/api/payments/{receipt['id']}", json={"voucher_type": "receipt", "amount": 108000, "notes": "Updated reference"}))
    assert omitted["invoice_allocations"] == receipt["invoice_allocations"]
    edited = _ok(client.put(f"/api/payments/{receipt['id']}", json={"voucher_type": "receipt", "amount": 108000, "invoice_allocations": [{**allocation, "tds_amount": 9000}]}))
    stored = edited["invoice_allocations"][0]
    assert (stored["tds_amount"], stored["tds_rate"], stored["tds_section_ref"], stored["tds_base_amount"]) == (9000, 10, allocation["tds_section_ref"], 100000)
    assert _report(customer)["total_tds"] == 9000
    assert _ok(client.get(f"/api/invoices/{invoice['id']}"))["remaining_amount"] == 1000
    cleared = _ok(client.put(f"/api/payments/{receipt['id']}", json={"voucher_type": "receipt", "amount": 108000, "invoice_allocations": [{**stored, "tds_amount": 0}]}))
    assert cleared["invoice_allocations"][0]["tds_section_ref"] is None
    assert _report(customer)["total_tds"] == 0
    # Restore using the saved catalogue row, then cancelling removes both settlements.
    _ok(client.put(f"/api/payments/{receipt['id']}", json={"voucher_type": "receipt", "amount": 108000, "invoice_allocations": [allocation]}))
    _ok(client.delete(f"/api/payments/{receipt['id']}"))
    assert _report(customer)["rows"] == []
    assert _ok(client.get(f"/api/invoices/{invoice['id']}"))["remaining_amount"] == 118000
    assert _ok(client.get(f"/api/ledgers/{customer['ledger']}/statement", params=PERIOD))["closing_balance"] == 118000


def test_credit_note_and_tds_both_reduce_remaining(customer):
    client = customer["client"]
    invoice = _invoice(customer)
    _ok(client.post("/api/credit-notes/", json={
        "ledger_id": customer["ledger"], "invoice_ids": [invoice["id"]], "credit_note_type": "discount",
        "credit_note_date": "2026-04-10", "items": [{"invoice_id": invoice["id"], "invoice_item_id": invoice["items"][0]["id"], "discount_amount_inclusive": 8000}],
    }), 201)
    _ok(_receipt(customer, invoice, cash=100000))
    assert _ok(client.get(f"/api/invoices/{invoice['id']}"))["payment_status"] == "paid"
    assert _ok(client.get(f"/api/ledgers/{customer['ledger']}/statement", params=PERIOD))["closing_balance"] == 0


@pytest.mark.parametrize("invoice_date,year,quarter,ref", [
    ("2026-03-31", 2025, 4, "194J"), ("2026-04-01", 2026, 1, "393(1) Sl. No. 6(iii)"),
    ("2026-07-01", 2026, 2, "393(1) Sl. No. 6(iii)"), ("2026-10-01", 2026, 3, "393(1) Sl. No. 6(iii)"),
])
def test_invoice_date_picks_act_and_report_quarter_even_when_receipt_is_later(customer, invoice_date, year, quarter, ref):
    invoice = _invoice(customer, invoice_date)
    option = _professional(customer, invoice)
    assert option["section_ref"] == ref
    assert option["amount"] == 10000
    _ok(_receipt(customer, invoice, section=option["id"], date="2027-01-15"))
    report = _report(customer, year, quarter)
    assert len(report["rows"]) == 1 and report["total_tds"] == 10000
    assert report["rows"][0]["deductions"][0]["receipt_date"] == "2027-01-15"
    assert _report(customer, year, quarter % 4 + 1)["rows"] == []
    csv_response = customer["client"].get("/api/tds-receivable/csv", params={"tax_year": year, "quarter": quarter})
    assert csv_response.status_code == 200
    row = list(csv.reader(StringIO(csv_response.text)))[1]
    assert row[1] == "ABCDE1234F" and row[3:6] == [invoice_date, "2027-01-15", ref]
    assert row[7:] == ["100000.00", "10000.00", "10000.00"]


def test_invalid_act_or_tcs_section_is_rejected(customer):
    client = customer["client"]
    invoice = _invoice(customer, "2026-03-31")
    for kind in ("tds", "tcs"):
        wrong = _ok(client.get("/api/tax-withholding-sections", params={"kind": kind, "date": "2026-04-01"}))[0]
        response = _receipt(customer, invoice, section=wrong["id"])
        assert response.status_code == 400 and "invoice date" in response.json()["detail"]


@pytest.mark.parametrize("party_type,pan,rate", [("individual", "ABCDE1234F", 1), ("huf", "ABCDE1234F", 1), ("company", "ABCDE1234F", 2), ("firm", None, 20)])
def test_suggestions_use_customer_pan_party_type_and_pre_gst_base(customer, party_type, pan, rate):
    client = customer["client"]
    ledger = _ok(client.get(f"/api/ledgers/{customer['ledger']}"))
    _ok(client.put(f"/api/ledgers/{customer['ledger']}", json={**ledger, "pan": pan, "party_type": party_type}))
    option = next(row for row in _options(customer, _invoice(customer)) if row["legacy_code"] == "194C")
    assert (option["rate"], option["amount"]) == (rate, rate * 1000)


def test_multiple_receipts_are_one_invoice_row_and_totals_match(customer):
    invoice = _invoice(customer)
    section = _professional(customer, invoice)["id"]
    _ok(_receipt(customer, invoice, cash=50000, tds=5000, section=section))
    _ok(_receipt(customer, invoice, cash=58000, tds=5000, section=section, date="2026-07-01"))
    report = _report(customer, quarter=1)
    assert len(report["rows"]) == 1
    assert len(report["rows"][0]["deductions"]) == 2
    assert report["total_tds"] == report["by_section"][0]["tds_amount"] == report["by_customer"][0]["tds_amount"] == 10000


def test_company_setting_and_tenant_isolation(customer, app_db, signed_in):
    client = customer["client"]
    invoice = _invoice(customer)
    section = _professional(customer, invoice)["id"]
    profile = _ok(client.get("/api/company/"))
    _ok(client.put("/api/company/", json={**profile, "enable_customer_tds": False}))
    assert _options(customer, invoice) == []
    assert _receipt(customer, invoice, section=section).status_code == 400
    _ok(client.put("/api/company/", json={**profile, "enable_customer_tds": True}))
    _ok(_receipt(customer, invoice, section=section))
    with app_db.owner_engine.begin() as conn:
        conn.execute(text("INSERT INTO global_settings (id, max_companies, created_at, updated_at) VALUES (1, 3, now(), now()) ON CONFLICT (id) DO UPDATE SET max_companies = 3"))
    other = _seed_company(client, signed_in, app_db, "bob@beta.example", "Beta", "BETA-TDS")
    client.headers["X-Company-Id"] = str(other["company"])
    assert _report(other | {"client": client})["rows"] == []
    assert _receipt(other | {"client": client}, invoice, section=section).status_code == 404


@pytest.mark.parametrize("bad", [-1, "NaN", "Infinity", 99999999.995])
def test_invalid_tds_amounts_are_rejected_before_storage(customer, bad):
    response = _receipt(customer, _invoice(customer), tds=bad)
    assert response.status_code == 422


def test_migration_defaults_and_round_trip(app_db):
    migration = _migration("20261108000001_customer_receipt_tds")
    with app_db.owner_engine.begin() as conn:
        migration.down(conn)
        migration.up(conn)
        migration.up(conn)
        columns = conn.execute(text("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'payment_invoice_allocations'"))
        tds = next(row for row in columns if row.column_name == "tds_amount")
        assert Decimal(tds.column_default) == 0 and tds.is_nullable == "NO"
