import { describe, expect, it } from 'vitest';
import { computeInvoiceTotals } from './invoiceTotals';
import { matchingSalesTcsSection, salesTcsCalculation, tcsLabel } from './salesTcs';
import type { TaxWithholdingSection } from '../types/api';

export const scrap: TaxWithholdingSection = {
  id: 1, kind: 'tcs', act: 2025, section_ref: '394(1) Sl. No. 4', legacy_code: '206C(1)', nature: 'Sale of scrap',
  rate_individual_huf: 2, rate_other: 2, rate_no_pan: 5, base: 'gross', effective_from: '2026-04-01',
  effective_to: null, threshold_single: null, threshold_note: null,
};
const buyer = { pan: 'ABCDE1234F', party_type: 'company' };

describe('sales TCS suggestions and totals', () => {
  it.each([false, true])('gives the scrap example with inclusive prices=%s', (inclusive) => {
    const result = computeInvoiceTotals([{ unitPrice: inclusive ? 118000 : 100000, quantity: 1, gstRate: 18 }], {
      taxInclusive: inclusive, tcs: salesTcsCalculation(scrap, buyer, ''),
    });
    expect(result).toMatchObject({ taxableAmount: 100000, taxAmount: 18000, tcsBaseAmount: 118000, tcsAmount: 2360, total: 120360 });
  });
  it('uses historical section rates as returned for the document date', () => {
    expect(salesTcsCalculation({ ...scrap, rate_other: 1, act: 1961 }, buyer, '')?.rate).toBe(1);
    expect(salesTcsCalculation(scrap, buyer, '')?.rate).toBe(2);
  });
  it.each([[2, 5], [5, 10], [15, 20], [20, 20]])('applies the no-PAN rule at normal rate %s', (rate, expected) => {
    expect(salesTcsCalculation({ ...scrap, rate_other: rate }, { ...buyer, pan: null }, '')?.rate).toBe(expected);
  });
  it('suggests zero for declarations and preserves explicit zero or other overrides', () => {
    const declared = { ...buyer, tcs_declaration_received: true };
    expect(salesTcsCalculation(scrap, declared, '')?.amount).toBe(0);
    expect(salesTcsCalculation(scrap, declared, '123.45')?.amount).toBe(123.45);
    expect(salesTcsCalculation(scrap, buyer, '0')?.amount).toBe(0);
  });
  it('retains a saved rate/base despite master-table changes', () => {
    expect(salesTcsCalculation({ ...scrap, rate_other: 9, base: 'taxable' }, buyer, '2360', {
      tcs_section_id: 1, tcs_rate: 2, tcs_base: 'gross',
    })).toEqual({ rate: 2, base: 'gross', amount: 2360 });
  });
  it.each([
    ['gross', 1000, 117000, 2340, 119340, 0],
    ['taxable', 1000, 99000, 1980, 118980, 0],
    ['gross', 0.51, 117999.49, 2359.99, 120359, -0.48],
    ['taxable', 999999, 0, 0, 0, 0],
  ] as const)('calculates %s base after a %s discount, then rounds after TCS', (base, discount, expectedBase, tcsAmount, total, roundOffAmount) => {
    const result = computeInvoiceTotals([{ unitPrice: 100000, quantity: 1, gstRate: 18 }], {
      taxInclusive: false, invoiceDiscount: { type: 'net', value: discount }, applyRoundOff: true, tcs: { rate: 2, base },
    });
    expect(result).toMatchObject({ tcsBaseAmount: expectedBase, tcsAmount, total, roundOffAmount, taxableAmount: 100000, taxAmount: 18000 });
    expect(Math.round((result.taxableAmount + result.taxAmount - result.invoiceDiscountAmount + tcsAmount + roundOffAmount) * 100)).toBe(total * 100);
  });
  it('formats the printed snapshot', () => {
    expect(tcsLabel({ tcs_rate: 2, tcs_section_ref: scrap.section_ref })).toBe('TCS @ 2% (s.394(1) Sl. No. 4)');
  });
  it('copies a historical section to the equivalent new Act row', () => {
    const old = { ...scrap, id: 10, act: 1961, section_ref: '206C(1) Sl. No. (vi)', rate_other: 1 };
    expect(matchingSalesTcsSection(old, [scrap])?.id).toBe(scrap.id);
    expect(matchingSalesTcsSection({ ...old, legacy_code: '206C(1F)', nature: 'Sale of motor vehicles above the threshold' },
      [{ ...scrap, id: 2, legacy_code: '206C(1F)', nature: 'Sale of motor vehicles or notified goods above ₹10 lakh' }])?.id).toBe(2);
  });
  it('does not apply a manufacturing declaration to motor vehicles', () => {
    expect(salesTcsCalculation({ ...scrap, legacy_code: '206C(1F)' }, { ...buyer, tcs_declaration_received: true }, '')?.amount).toBeUndefined();
  });
});
