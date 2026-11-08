import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { OutstandingInvoice, PaymentInvoiceAllocation } from '../types/api';
import TdsAllocationFields from './TdsAllocationFields';

const invoice: OutstandingInvoice = {
  id: 1, invoice_number: 'INV-1', invoice_date: '2026-04-01', due_date: null, total_amount: 118000,
  paid_amount: 0, remaining_amount: 118000, outstanding_amount: 118000, payment_status: 'unpaid',
  due_in_days: null, suggested_allocation_amount: null, tds_enabled: true,
  tds_options: [{ id: 2, section_ref: '393(1) Sl. No. 6(iii)', legacy_code: '194J', nature: 'Professional fees', rate: 10, amount: 10000 }],
};
const allocation: PaymentInvoiceAllocation = { invoice_id: 1, allocated_amount: 108000, tds_amount: 10000, tds_section_id: 2 };
const render = (bill = invoice, row = allocation) => renderToStaticMarkup(<TdsAllocationFields invoice={bill} allocation={row} currencyCode="INR" onChange={() => {}} />);

it('shows optional section, editable deduction, suggestion and fully settled status', () => {
  const html = render();
  for (const text of ['TDS section (optional)', 'TDS deducted', '393(1) Sl. No. 6(iii)', 'Suggested', '10,000', '10% before GST', 'Fully settled by cash + TDS']) expect(html).toContain(text);
});

it('keeps the ordinary receipt unchanged while TDS is disabled', () => {
  expect(render({ ...invoice, tds_enabled: false }, { invoice_id: 1, allocated_amount: 118000 })).toBe('');
});

it('keeps historical deductions editable after disabling the setting', () => {
  const html = render({ ...invoice, tds_enabled: false, tds_options: [] }, { ...allocation, tds_section_ref: '194J' });
  expect(html).toContain('194J (saved)');
  expect(html).toContain('value="10000"');
});

it('shows remaining or over-settled amounts', () => {
  expect(render(invoice, { ...allocation, tds_amount: 9000 })).toContain('Remaining after cash + TDS');
  expect(render(invoice, { ...allocation, tds_amount: 11000 })).toContain('Over-settled by');
});
