"""Store customer TDS separately from receipt cash, with historical tax snapshots."""

from sqlalchemy import text


def up(conn) -> None:
    conn.execute(text("ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS enable_customer_tds BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("""
        ALTER TABLE payment_invoice_allocations
        ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tds_section_id INTEGER REFERENCES tax_withholding_sections(id),
        ADD COLUMN IF NOT EXISTS tds_section_ref VARCHAR(64),
        ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(7,3),
        ADD COLUMN IF NOT EXISTS tds_base_amount NUMERIC(10,2)
    """))


def down(conn) -> None:
    conn.execute(text("""
        ALTER TABLE payment_invoice_allocations
        DROP COLUMN IF EXISTS tds_base_amount,
        DROP COLUMN IF EXISTS tds_rate,
        DROP COLUMN IF EXISTS tds_section_ref,
        DROP COLUMN IF EXISTS tds_section_id,
        DROP COLUMN IF EXISTS tds_amount
    """))
    conn.execute(text("ALTER TABLE company_profiles DROP COLUMN IF EXISTS enable_customer_tds"))
