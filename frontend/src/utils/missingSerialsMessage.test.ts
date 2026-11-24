import { describe, expect, it } from 'vitest';
import { missingSerialsMessage } from './missingSerialsMessage';

describe('missing serial numbers beside invoice submission', () => {
  it('clears the explanation when no lines remain blocked', () => {
    expect(missingSerialsMessage([])).toBe('');
  });
  it('identifies one missing line', () => {
    expect(missingSerialsMessage([1])).toBe('Line 1 has no serial number yet. Add one to create the invoice.');
  });
  it('joins two nonconsecutive line numbers', () => {
    expect(missingSerialsMessage([1, 3])).toBe('Lines 1 and 3 have no serial number yet. Add one to each to create the invoice.');
  });
  it('joins three or more line numbers without changing them', () => {
    const lines = [1, 3, 4];
    expect(missingSerialsMessage(lines)).toBe('Lines 1, 3 and 4 have no serial number yet. Add one to each to create the invoice.');
    expect(lines).toEqual([1, 3, 4]);
  });
});
