import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import TdsReportTable, { type TdsReport } from './TdsReportTable';

const report: TdsReport = {
  tax_year: 2025, quarter: 4, total_tds: 10000,
  rows: [{ invoice_id: 1, invoice_number: 'INV-2025', invoice_date: '2026-03-31', customer_id: 1,
    customer_name: 'Customer <A>', customer_pan: 'ABCDE1234F', tds_amount: 10000,
    deductions: [{ receipt_id: 1, receipt_date: '2026-04-15', section_ref: '194J', rate: 10, taxable_amount: 100000, tds_amount: 5000 },
      { receipt_id: 2, receipt_date: '2026-07-15', section_ref: '194J', rate: 10, taxable_amount: 100000, tds_amount: 5000 }],
  }],
  by_section: [{ label: '194J', tds_amount: 10000 }],
  by_customer: [{ label: 'Customer <A>', customer_id: 1, tds_amount: 10000 }],
};

it('renders one invoice row with receipt details and section/customer totals', () => {
  const html = renderToStaticMarkup(<TdsReportTable report={report} />);
  expect(html.match(/INV-2025/g)).toHaveLength(1);
  for (const value of ['ABCDE1234F', 'Customer &lt;A&gt;', '194J', '10%', 'By section', 'By customer', '10,000', '1,00,000']) expect(html).toContain(value);
  expect(html).toContain('scope="col"');
});

it('renders the empty period clearly', () => {
  expect(renderToStaticMarkup(<TdsReportTable report={{ ...report, rows: [], by_section: [], by_customer: [], total_tds: 0 }} />)).toContain('No TDS deductions for this period.');
});
