# TCS on sales invoices

Enable **TCS on sales invoices** in Company settings when you sell goods that
require income-tax TCS. It is off by default. Ordinary sales of goods do not
attract TCS: the former section 206C(1H) was removed from 1 April 2025.

Choose a section in the invoice or quotation composer. The document date selects
the effective section and rate, including the 1961/2025 Act boundary on 1 April
2026. Remittances, tours and licences are excluded from this sales selector.
Review applicability and thresholds yourself; the app suggests a collection and
lets you enter the actual amount, including zero. A buyer's manufacturing
declaration suggests zero. Missing PAN uses the higher rate in the section data,
at least twice the normal rate or 5%, capped at 20%.

TCS uses the section's base: gross includes GST, taxable excludes it, and both
subtract the invoice discount. TCS is rounded to paise before the final rupee
round-off. GST fields never include TCS. Each document saves its section, rate,
base and amount; the buyer PAN is also saved for reporting. Editing a document
retains its section snapshot unless the section or buyer/PAN changes. Copies
and quotation conversions carry the chosen amount and find the corresponding
section valid on the new date.

PDFs, public shares and invoice emails show the collection separately. Credit
notes reverse it in proportion, with cumulative rounding so a full return
reverses every paisa. For TCS invoices they also reverse the corresponding
invoice discount and round-off, keeping the customer balance exact.

**Reports → TCS Collected** lists invoice snapshots and negative credit reversals,
with April–March tax year and quarter filters, section totals and CSV export.
Use Form 143 for tax years from April 2026 and Form 27EQ for earlier periods.
The report records invoiced collections and their reversals, not tax deposits.

GSTR-1 invoice values, e-way bill totals, marketplace posting totals and dashboard
invoice totals include TCS because they describe the amount billed. E-way bill
JSON includes TCS in `OthValue`. GST taxable values and tax heads exclude it;
product revenue and profit analytics exclude it too. Automatic marketplace
posting does not choose a TCS section on the seller's behalf.
