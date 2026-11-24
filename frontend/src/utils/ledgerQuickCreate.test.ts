import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../api/client';
import type { LedgerCreate } from '../types/api';
import { findLedgerByGstin, hasLedgerDetails, isDuplicateGstinError } from './ledgerQuickCreate';

const empty: LedgerCreate = {
  name: 'Ramesh', phone_number: '9876543210', gst: '', pan: '', party_type: null,
  opening_balance: null, address: '', email: '', website: '', bank_name: '',
  branch_name: '', account_name: '', account_number: '', ifsc_code: '',
};

describe('optional ledger details disclosure', () => {
  it('can stay folded when only the short form has values', () => {
    expect(hasLedgerDetails(empty)).toBe(false);
    expect(hasLedgerDetails({ ...empty, address: '  ' })).toBe(false);
  });

  it.each([
    'address', 'email', 'website', 'bank_name', 'branch_name', 'account_name',
    'account_number', 'ifsc_code',
  ] as const)('keeps an entered %s visible', (field) => {
    expect(hasLedgerDetails({ ...empty, [field]: 'saved value' })).toBe(true);
  });

  it.each([0, 100, -100])('keeps an entered balance of %s visible', (opening_balance) => {
    expect(hasLedgerDetails({ ...empty, opening_balance })).toBe(true);
  });
});

describe('duplicate GSTIN recovery', () => {
  const gst = '27AAPFU0939F1ZV';
  afterEach(() => vi.restoreAllMocks());

  it('finds the exact GSTIN among other search matches', async () => {
    const owner = { id: 42, name: 'Verma Traders', gst };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [
      { id: 1, name: gst, gst: '' },
      { id: 2, name: 'Other customer', gst: gst + 'X' },
      owner,
    ] } });
    expect(await findLedgerByGstin(gst)).toEqual(owner);
    expect(get).toHaveBeenCalledWith('/ledgers/', { params: { search: gst, page_size: 5 } });
  });

  it.each([{ items: [] }, { items: [{ id: 1, name: gst, gst: '' }] }])('returns no owner for a missing exact match: $items', async ({ items }) => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items } });
    expect(await findLedgerByGstin(gst)).toBeNull();
  });

  it('allows a fallback when lookup fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('No access'));
    expect(await findLedgerByGstin(gst)).toBeNull();
  });

  it.each([
    [400, 'Ledger with this GST already exists', gst, true],
    [400, 'Buyer with this GST already exists. Run latest migrations', gst, true],
    [400, 'Ledger with this GST already exists', '', false],
    [400, 'Ledger with this GST already exists', '   ', false],
    [400, 'A different validation error', gst, false],
    [500, 'Ledger with this GST already exists', gst, false],
  ])('only recognizes the duplicate response (%s, %s, %s)', (status, detail, value, expected) => {
    expect(isDuplicateGstinError({ isAxiosError: true, response: { status, data: { detail } } }, value)).toBe(expected);
  });

  it('does not classify an unrelated Error as an API duplicate', () => {
    expect(isDuplicateGstinError(new Error('already exists'), gst)).toBe(false);
  });
});
