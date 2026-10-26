import { describe, expect, test } from 'vitest';
import { addDaysToIsoDate, createDueDateFormState, resolveDueDate } from './invoiceDueDate.ts';

describe('addDaysToIsoDate — calendar arithmetic on ISO dates', () => {
  test('same-day addition is a no-op', () => {
    expect(addDaysToIsoDate('2024-03-15', 0)).toBe('2024-03-15');
  });

  test('month rollover', () => {
    expect(addDaysToIsoDate('2024-01-31', 1)).toBe('2024-02-01');
  });

  test('year rollover', () => {
    expect(addDaysToIsoDate('2024-12-31', 1)).toBe('2025-01-01');
  });

  test('leap day: 2024-02-28 + 1 lands on Feb 29', () => {
    expect(addDaysToIsoDate('2024-02-28', 1)).toBe('2024-02-29');
  });

  test('negative days walk backwards across a month boundary', () => {
    expect(addDaysToIsoDate('2024-03-01', -1)).toBe('2024-02-29');
  });

  test('invalid input returns an empty string', () => {
    expect(addDaysToIsoDate('', 5)).toBe('');
    expect(addDaysToIsoDate('not-a-date', 5)).toBe('');
    expect(addDaysToIsoDate('2024-02', 5)).toBe('');
  });
});

describe('resolveDueDate — one rule per mode', () => {
  test('none mode always yields undefined', () => {
    expect(
      resolveDueDate({ mode: 'none', invoiceDate: '2024-01-25', exactDate: '2024-02-01', daysFromInvoice: '7' }),
    ).toBe(undefined);
  });

  test('exact mode returns the exact date, or undefined when it is blank', () => {
    expect(
      resolveDueDate({ mode: 'exact', invoiceDate: '2024-01-25', exactDate: '2024-02-01', daysFromInvoice: '' }),
    ).toBe('2024-02-01');
    expect(
      resolveDueDate({ mode: 'exact', invoiceDate: '2024-01-25', exactDate: '', daysFromInvoice: '' }),
    ).toBe(undefined);
  });

  test('days mode adds to the invoice date', () => {
    expect(
      resolveDueDate({ mode: 'days', invoiceDate: '2024-01-25', exactDate: '', daysFromInvoice: '7' }),
    ).toBe('2024-02-01');
  });

  test('days mode rejects negative days', () => {
    expect(
      resolveDueDate({ mode: 'days', invoiceDate: '2024-01-25', exactDate: '', daysFromInvoice: '-5' }),
    ).toBe(undefined);
  });

  test('days mode rejects non-numeric days', () => {
    expect(
      resolveDueDate({ mode: 'days', invoiceDate: '2024-01-25', exactDate: '', daysFromInvoice: 'abc' }),
    ).toBe(undefined);
  });

  test('days mode yields undefined when the invoice date is empty', () => {
    expect(
      resolveDueDate({ mode: 'days', invoiceDate: '', exactDate: '', daysFromInvoice: '7' }),
    ).toBe(undefined);
  });
});

describe('createDueDateFormState — from a stored due date back to the form', () => {
  test('no due date means none mode with blank fields', () => {
    expect(createDueDateFormState()).toEqual({ mode: 'none', exactDate: '', daysFromInvoice: '' });
    expect(createDueDateFormState(null)).toEqual({ mode: 'none', exactDate: '', daysFromInvoice: '' });
    expect(createDueDateFormState('')).toEqual({ mode: 'none', exactDate: '', daysFromInvoice: '' });
  });

  test('a due date means exact mode with that date', () => {
    expect(createDueDateFormState('2024-03-15')).toEqual({
      mode: 'exact',
      exactDate: '2024-03-15',
      daysFromInvoice: '',
    });
  });

  test('a full timestamp is trimmed to the date part', () => {
    expect(createDueDateFormState('2024-03-15T10:30:00')).toEqual({
      mode: 'exact',
      exactDate: '2024-03-15',
      daysFromInvoice: '',
    });
  });
});
