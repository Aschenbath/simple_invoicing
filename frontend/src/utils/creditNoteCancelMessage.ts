import type { CreditNote } from '../types/api';
import formatCurrency from './formatting';

export function creditNoteCancelMessage(
  note: Pick<CreditNote, 'credit_note_number' | 'credit_note_type' | 'direction' | 'total_amount'>,
  customer: string,
  invoiceLabels: string,
  currencyCode = 'INR',
): string {
  const amount = formatCurrency(note.total_amount, currencyCode);
  const ending = 'The note stays on the list as cancelled and keeps its number. This cannot be undone.';
  if (note.direction === 'inward' || note.credit_note_type === 'adjustment') {
    return `${note.credit_note_number} for ${customer}, ${amount}, will be cancelled. ${ending}`;
  }
  if (note.credit_note_type === 'return') {
    return `The returned items go back out of stock and the ${amount} credit for ${customer} on ${invoiceLabels} is taken off. ${ending}`;
  }
  return `The ${amount} discount for ${customer} on ${invoiceLabels} is taken off. ${ending}`;
}
