"""Optional sales TCS and its document snapshots and credit reversals."""

from sqlalchemy import text


def up(conn):
    conn.execute(text("ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS enable_tcs BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE buyers ADD COLUMN IF NOT EXISTS tcs_declaration_received BOOLEAN NOT NULL DEFAULT false"))
    for table in ("invoices", "quotations"):
        for definition in (
            "tcs_section_id INTEGER REFERENCES tax_withholding_sections(id)",
            "tcs_section_ref VARCHAR(64)",
            "tcs_base VARCHAR(16)",
            "tcs_rate NUMERIC(7,3) NOT NULL DEFAULT 0",
            "tcs_base_amount NUMERIC(10,2) NOT NULL DEFAULT 0",
            "tcs_amount NUMERIC(10,2) NOT NULL DEFAULT 0",
            "ledger_pan VARCHAR(10)",
        ):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {definition}"))
    for table in ("credit_notes", "credit_note_items"):
        for column in ("tcs_amount", "tcs_base_amount", "invoice_adjustment_amount"):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} NUMERIC(10,2) NOT NULL DEFAULT 0"))


def down(conn):
    for table in ("credit_note_items", "credit_notes"):
        for column in ("invoice_adjustment_amount", "tcs_base_amount", "tcs_amount"):
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))
    for table in ("quotations", "invoices"):
        for column in ("ledger_pan", "tcs_amount", "tcs_base_amount", "tcs_rate", "tcs_base", "tcs_section_ref", "tcs_section_id"):
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))
    conn.execute(text("ALTER TABLE buyers DROP COLUMN IF EXISTS tcs_declaration_received"))
    conn.execute(text("ALTER TABLE company_profiles DROP COLUMN IF EXISTS enable_tcs"))
