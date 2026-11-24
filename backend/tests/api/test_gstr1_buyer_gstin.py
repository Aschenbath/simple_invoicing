"""Legacy buyer GSTIN snapshots must be checked just as they are in GSTR-3B."""
import pytest

from src.models.invoice import Invoice
from tests.api.test_gstr1_filing_edges import (
    _by_field, _create_product, _export, _ledger_with_gst, _move_out_of_period,
    _note, _period, _sale, _validate, MAHARASHTRA_BUYER, seller,
)


@pytest.mark.parametrize("gstin, problem", [
    ("27ABCDE1234F1Z5", "check digit is wrong"),
    ("39ABCDE1234F1Z0", "state code 39 does not exist"),
    ("INVALID", "not a valid 15-character GSTIN"),
])
def test_legacy_buyer_gstin_blocks_validation_and_json_export(client, seller, db_session, gstin, problem):
    buyer = _ledger_with_gst(client, "Buyer", MAHARASHTRA_BUYER)
    product = _create_product(client, "GSTIN-1", "Phone", hsn_sac="8517")
    invoice = _sale(client, buyer, product)
    stored = db_session.get(Invoice, invoice["id"])
    stored.ledger_gst = gstin
    db_session.commit()

    result = _validate(client)
    errors = [error for error in _by_field(result, "GSTIN") if error["severity"] == "error"]
    assert result["status"] == "invalid"
    assert len(errors) == 1
    assert errors[0]["invoice_number"] == invoice["invoice_number"]
    assert problem in errors[0]["message"]
    assert "ledger" in errors[0]["message"]
    assert "save this invoice again" in errors[0]["message"]
    response = client.get("/api/ledgers/tax-ledger/gstr1/export-json", params=_period())
    assert response.status_code == 400
    assert errors[0]["message"] in response.json()["detail"]
    db_session.refresh(stored)
    assert stored.ledger_gst == gstin  # Reporting never silently repairs old invoices.


@pytest.mark.parametrize("gstin, problem", [
    ("27ABCDE1234F1Z5", "check digit is wrong"),
    ("39ABCDE1234F1Z0", "state code 39 does not exist"),
])
def test_note_with_bad_source_gstin_explains_how_to_repair_it(client, seller, db_session, gstin, problem):
    buyer = _ledger_with_gst(client, "Buyer", MAHARASHTRA_BUYER)
    product = _create_product(client, "GSTIN-NOTE", "Phone", hsn_sac="8517")
    invoice = _sale(client, buyer, product)
    note = _note(client, [invoice])
    stored = db_session.get(Invoice, invoice["id"])
    stored.ledger_gst = gstin
    db_session.commit()
    _move_out_of_period(db_session, invoice)

    result = _validate(client)
    errors = [error for error in _by_field(result, "GSTIN") if error["severity"] == "error"]
    assert result["status"] == "invalid"
    assert len(errors) == 1
    message = errors[0]["message"]
    assert problem in message
    assert invoice["invoice_number"] in message
    assert f'Cancel credit note {note["credit_note_number"]}' in message
    assert "ledger" in message
    assert "same date" in message
    response = client.get("/api/ledgers/tax-ledger/gstr1/export-json", params=_period())
    assert response.status_code == 400
    assert message in response.json()["detail"]


@pytest.mark.parametrize("gstin", ["27ABCDE1234F1Z0", " 27abcde1234f1z0 ", None, ""])
def test_valid_or_unregistered_buyer_can_still_file(client, seller, db_session, gstin):
    buyer = _ledger_with_gst(client, "Buyer", MAHARASHTRA_BUYER)
    product = _create_product(client, "GSTIN-OK", "Phone", hsn_sac="8517")
    invoice = _sale(client, buyer, product)
    stored = db_session.get(Invoice, invoice["id"])
    stored.ledger_gst = gstin
    # B2C supplies keep their original place of supply explicitly.
    stored.place_of_supply = "27"
    db_session.commit()
    assert not [e for e in _by_field(_validate(client), "GSTIN") if e["severity"] == "error"]
    _export(client)
