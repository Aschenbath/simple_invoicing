export type PaymentInvoiceAllocationLike = {
  invoice_id: number;
  invoice_number?: string | null;
  allocated_amount: number | string | null | undefined;
  tds_amount?: number;
  tds_section_id?: number | null;
};

export function remainingAmount(paymentAmount: number, allocatedTotal: number): number {
  return (Math.round(paymentAmount * 100) - Math.round(allocatedTotal * 100)) / 100;
}

export function validateAllocations(
  allocations: PaymentInvoiceAllocationLike[] | undefined,
  paymentAmount: number,
): string | null {
  const list = allocations ?? [];
  for (const allocation of list) {
    const amount = Number(allocation.allocated_amount);
    const tds = Number(allocation.tds_amount ?? 0);
    if (!Number.isFinite(tds) || tds < 0) return 'TDS amount must be a non-negative number';
    if (tds > 0 && !allocation.tds_section_id) return 'Select a TDS section for each deduction';
    if (!Number.isFinite(amount) || amount < 0 || amount + tds <= 0) {
      return `Allocated amount for ${allocation.invoice_number ?? `invoice ${allocation.invoice_id}`} must be greater than 0`;
    }
  }
  const totalPaise = list.reduce((sum, a) => sum + Math.round(Number(a.allocated_amount || 0) * 100), 0);
  if (totalPaise > Math.round(paymentAmount * 100)) {
    return 'Allocated amounts exceed the payment amount';
  }
  return null;
}
