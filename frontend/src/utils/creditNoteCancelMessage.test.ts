import { describe, expect, it } from 'vitest';
import { creditNoteCancelMessage } from './creditNoteCancelMessage';

const note = { credit_note_number: 'CN-2026-001', credit_note_type: 'discount' as const, direction: 'outward' as const, total_amount: 1180 };
const ending = 'The note stays on the list as cancelled and keeps its number. This cannot be undone.';

describe('credit note cancellation explanation', () => {
  it('names the discount, customer and affected invoices', () => {
    expect(creditNoteCancelMessage(note, 'Sample Customer', 'INV-1, INV-2')).toBe(
      `The ₹1,180.00 discount for Sample Customer on INV-1, INV-2 is taken off. ${ending}`,
    );
  });

  it('explains that cancelling a return also removes the returned stock', () => {
    expect(creditNoteCancelMessage({ ...note, credit_note_type: 'return' }, 'Sample Customer', 'INV-1')).toBe(
      `The returned items go back out of stock and the ₹1,180.00 credit for Sample Customer on INV-1 is taken off. ${ending}`,
    );
  });

  it.each(['return', 'discount', 'adjustment'] as const)('uses the supplier wording for an inward %s note', (credit_note_type) => {
    expect(creditNoteCancelMessage({ ...note, direction: 'inward', credit_note_type }, 'Sample Supplier', 'PUR-1', 'USD')).toBe(
      `CN-2026-001 for Sample Supplier, $1,180.00, will be cancelled. ${ending}`,
    );
  });

  it('does not describe a legacy adjustment as a discount or stock return', () => {
    expect(creditNoteCancelMessage({ ...note, credit_note_type: 'adjustment' }, 'Ledger #8', '#9')).toBe(
      `CN-2026-001 for Ledger #8, ₹1,180.00, will be cancelled. ${ending}`,
    );
  });
});
