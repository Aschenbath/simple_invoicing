import { describe, expect, it } from 'vitest';
import type { OutstandingInvoice, PaymentInvoiceAllocation, TdsOption } from '../types/api';
import { changeTdsAmount, changeTdsSection, settlementRemaining, suggestCashAllocations } from './customerTds';
import { validateAllocations } from './validateAllocations';

const option: TdsOption = { id: 2, section_ref: '393(1) Sl. No. 6(iii)', legacy_code: '194J', nature: 'Professional fees', rate: 10, amount: 10000 };
const allocation: PaymentInvoiceAllocation = { invoice_id: 1, allocated_amount: 108000, tds_amount: 10000, tds_section_id: 2 };
const invoice = (id: number, amount: number): OutstandingInvoice => ({ id, invoice_number: `INV-${id}`, invoice_date: '2026-04-01', due_date: null, total_amount: amount, remaining_amount: amount, paid_amount: 0, outstanding_amount: amount, payment_status: 'unpaid', due_in_days: null, suggested_allocation_amount: null });

describe('customer TDS allocation', () => {
  it('settles cash plus TDS without counting TDS against the cash amount', () => {
    expect(settlementRemaining(118000, allocation)).toBe(0);
    expect(validateAllocations([allocation], 108000)).toBeNull();
    expect(validateAllocations([allocation], 107999)).toBe('Allocated amounts exceed the payment amount');
    expect(settlementRemaining(118000, { ...allocation, tds_amount: 10000.01 })).toBe(-0.01);
  });

  it('uses the suggestion initially and keeps an amount the customer actually withheld', () => {
    expect(changeTdsSection({ invoice_id: 1, allocated_amount: 118000 }, option, 118000)).toMatchObject({ allocated_amount: 108000, tds_amount: 10000, tds_section_id: 2 });
    expect(changeTdsSection({ ...allocation, tds_amount: 9000 }, option, 118000).tds_amount).toBe(9000);
    expect(changeTdsSection(allocation, undefined, 118000)).toMatchObject({ tds_amount: 0, tds_section_id: null });
  });

  it('preserves section snapshots while changing an amount and adjusts only excess cash', () => {
    const saved = { ...allocation, tds_section_ref: '194J', tds_rate: 10, tds_base_amount: 100000 };
    expect(changeTdsAmount(saved, 11000, 118000)).toEqual({ ...saved, allocated_amount: 107000, tds_amount: 11000 });
    expect(changeTdsAmount(saved, 9000, 118000).allocated_amount).toBe(108000);
  });

  it('auto-selects oldest invoices while keeping existing TDS and allocating only cash', () => {
    const result = suggestCashAllocations([invoice(1, 118000), invoice(2, 500)], 108200, [allocation]);
    expect(result).toMatchObject([allocation, { invoice_id: 2, allocated_amount: 200 }]);
    expect(result[1].invoice_number).toBe('INV-2');
    expect(suggestCashAllocations([invoice(1, 100), invoice(2, 50)], 110)).toMatchObject([{ invoice_id: 1, allocated_amount: 100 }, { invoice_id: 2, allocated_amount: 10 }]);
  });

  it('handles paise exactly and permits a TDS-only invoice allocation', () => {
    expect(settlementRemaining(0.3, { invoice_id: 1, allocated_amount: 0.1, tds_amount: 0.2 })).toBe(0);
    expect(validateAllocations([{ ...allocation, allocated_amount: 0 }], 1)).toBeNull();
    expect(validateAllocations([{ ...allocation, allocated_amount: 0, tds_amount: 0 }], 1)).toContain('greater than 0');
  });

  it('requires a section and rejects invalid deductions', () => {
    expect(validateAllocations([{ ...allocation, tds_section_id: null }], 108000)).toContain('Select a TDS section');
    for (const tds_amount of [-1, NaN, Infinity]) {
      expect(validateAllocations([{ ...allocation, tds_amount }], 108000)).toContain('non-negative');
    }
  });
});
