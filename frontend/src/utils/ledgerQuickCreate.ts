import type { LedgerCreate } from '../types/api';

/** Keep optional values visible when a dismissed sheet is opened again. */
export function hasLedgerDetails(form: LedgerCreate): boolean {
  return form.opening_balance != null || [
    form.address, form.email, form.website, form.bank_name, form.branch_name,
    form.account_name, form.account_number, form.ifsc_code,
  ].some((value) => value.trim().length > 0);
}
