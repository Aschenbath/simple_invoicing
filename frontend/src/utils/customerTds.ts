import type { OutstandingInvoice, PaymentInvoiceAllocation, TdsOption } from '../types/api';

export function settlementRemaining(remaining: number, allocation: PaymentInvoiceAllocation): number {
  return (Math.round(remaining * 100) - Math.round(allocation.allocated_amount * 100)
    - Math.round((allocation.tds_amount ?? 0) * 100)) / 100;
}

export function changeTdsAmount(allocation: PaymentInvoiceAllocation, amount: number, remaining: number): PaymentInvoiceAllocation {
  const cashLimit = Math.max(0, Math.round((remaining - amount) * 100) / 100);
  return { ...allocation, tds_amount: amount, allocated_amount: Math.min(allocation.allocated_amount, cashLimit) };
}

export function changeTdsSection(allocation: PaymentInvoiceAllocation, option: TdsOption | undefined, remaining: number): PaymentInvoiceAllocation {
  if (!option) return { ...allocation, tds_amount: 0, tds_section_id: null, tds_section_ref: null, tds_rate: null };
  return {
    ...changeTdsAmount(allocation, allocation.tds_amount || option.amount, remaining),
    tds_section_id: option.id, tds_section_ref: option.section_ref, tds_rate: option.rate,
  };
}

export function suggestCashAllocations(invoices: OutstandingInvoice[], amount: number, existing: PaymentInvoiceAllocation[] = []): PaymentInvoiceAllocation[] {
  let cash = Math.round(amount * 100);
  return invoices.flatMap((invoice) => {
    const saved = existing.find((row) => row.invoice_id === invoice.id);
    const tds = Math.round((saved?.tds_amount ?? 0) * 100);
    const allocated = Math.max(0, Math.min(cash, Math.round(invoice.remaining_amount * 100) - tds));
    cash -= allocated;
    return allocated || tds ? [{
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      ...saved,
      allocated_amount: allocated / 100,
    }] : [];
  });
}
