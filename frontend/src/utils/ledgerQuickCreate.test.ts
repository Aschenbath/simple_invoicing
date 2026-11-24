import { describe, expect, it } from 'vitest';
import type { LedgerCreate } from '../types/api';
import { hasLedgerDetails } from './ledgerQuickCreate';

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
