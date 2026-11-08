import type { OutstandingInvoice, PaymentInvoiceAllocation } from '../types/api';
import formatCurrency from '../utils/formatting';
import { changeTdsAmount, changeTdsSection, settlementRemaining } from '../utils/customerTds';

export default function TdsAllocationFields({ invoice, allocation, currencyCode, onChange }: {
  invoice: OutstandingInvoice;
  allocation: PaymentInvoiceAllocation;
  currencyCode: string;
  onChange: (allocation: PaymentInvoiceAllocation) => void;
}) {
  if (!invoice.tds_enabled && !allocation.tds_amount) return null;
  const options = invoice.tds_options ?? [];
  const option = options.find((row) => row.id === allocation.tds_section_id);
  const remaining = settlementRemaining(invoice.remaining_amount, allocation);
  return (
    <div className="stack" style={{ marginLeft: '28px', gap: '8px' }}>
      <label className="field">
        TDS section (optional)
        <select className="input" value={allocation.tds_section_id ?? ''}
          onChange={(event) => onChange(changeTdsSection(allocation,
            options.find((row) => row.id === Number(event.target.value)), invoice.remaining_amount))}>
          <option value="">No TDS</option>
          {allocation.tds_section_id && !option ? (
            <option value={allocation.tds_section_id}>{allocation.tds_section_ref} (saved)</option>
          ) : null}
          {options.map((row) => <option key={row.id} value={row.id}>
            {row.section_ref} · {row.nature}{row.legacy_code ? ` (${row.legacy_code})` : ''}
          </option>)}
        </select>
      </label>
      <label className="field">
        TDS deducted
        <input className="input" type="number" min="0" step="0.01" value={allocation.tds_amount || ''}
          onChange={(event) => onChange(changeTdsAmount(allocation, Number(event.target.value), invoice.remaining_amount))} />
      </label>
      {option ? <small>Suggested {formatCurrency(option.amount, currencyCode)} ({option.rate}% before GST). Enter the amount actually deducted.</small> : null}
      {allocation.tds_amount ? <small>The receipt amount and allocated amount are cash received; TDS is separate.</small> : null}
      {allocation.tds_amount ? <small>
        {remaining === 0 ? 'Fully settled by cash + TDS' : remaining > 0
          ? `Remaining after cash + TDS: ${formatCurrency(remaining, currencyCode)}`
          : `Over-settled by ${formatCurrency(-remaining, currencyCode)}`}
      </small> : null}
    </div>
  );
}
