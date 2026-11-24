import { isAxiosError } from 'axios';
import api, { getApiErrorMessage } from '../api/client';
import type { Ledger, LedgerCreate, PaginatedLedgers } from '../types/api';

export type ExistingGstinLedger = Pick<Ledger, 'id' | 'name' | 'gst'>;

export function isDuplicateGstinError(error: unknown, gst: string): boolean {
  return Boolean(gst.trim()) && isAxiosError(error) && error.response?.status === 400
    && /already exists/i.test(getApiErrorMessage(error));
}

/** Search can also match names/phones, so only an exact GSTIN identifies its owner. */
export async function findLedgerByGstin(gst: string): Promise<ExistingGstinLedger | null> {
  try {
    const { data } = await api.get<PaginatedLedgers>('/ledgers/', { params: { search: gst, page_size: 5 } });
    return data.items.find((ledger) => ledger.gst === gst) ?? null;
  } catch {
    // The duplicate error is still useful when this user cannot look up its owner.
    return null;
  }
}

/** Keep optional values visible when a dismissed sheet is opened again. */
export function hasLedgerDetails(form: LedgerCreate): boolean {
  return form.opening_balance != null || [
    form.address, form.email, form.website, form.bank_name, form.branch_name,
    form.account_name, form.account_number, form.ifsc_code,
  ].some((value) => value.trim().length > 0);
}
