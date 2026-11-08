import formatCurrency, { formatDate } from '../utils/formatting';

export type TdsReport = {
  tax_year: number;
  quarter: number | null;
  total_tds: number;
  rows: {
    invoice_id: number; invoice_number: string | null; invoice_date: string;
    customer_id: number; customer_name: string; customer_pan: string | null; tds_amount: number;
    deductions: { receipt_id: number; receipt_date: string; section_ref: string; rate: number; taxable_amount: number; tds_amount: number }[];
  }[];
  by_section: { label: string; tds_amount: number }[];
  by_customer: { label: string; customer_id: number; tds_amount: number }[];
};

export default function TdsReportTable({ report }: { report: TdsReport }) {
  return <>
    <p>Total TDS receivable: <strong>{formatCurrency(report.total_tds, 'INR')}</strong></p>
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr>{['Customer', 'PAN', 'Invoice', 'Invoice date', 'Receipt date', 'Section', 'Rate', 'Taxable amount', 'TDS amount'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{report.rows.map((row) => <tr key={row.invoice_id}>
          <td>{row.customer_name}</td><td>{row.customer_pan || '—'}</td>
          <td>{row.invoice_number || `#${row.invoice_id}`}</td><td>{formatDate(row.invoice_date)}</td>
          <td>{row.deductions.map((d, i) => <div key={i}>{formatDate(d.receipt_date)}</div>)}</td>
          <td>{row.deductions.map((d, i) => <div key={i}>{d.section_ref}</div>)}</td>
          <td>{row.deductions.map((d, i) => <div key={i}>{d.rate}%</div>)}</td>
          <td>{row.deductions.map((d, i) => <div key={i}>{formatCurrency(d.taxable_amount, 'INR')}</div>)}</td>
          <td>{formatCurrency(row.tds_amount, 'INR')}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {report.rows.length === 0 ? <p>No TDS deductions for this period.</p> : null}
    {(['by_section', 'by_customer'] as const).map((group) => <div key={group}>
      <h2>{group === 'by_section' ? 'By section' : 'By customer'}</h2>
      <table className="table"><thead><tr><th scope="col">{group === 'by_section' ? 'Section' : 'Customer'}</th><th scope="col">TDS amount</th></tr></thead>
        <tbody>{report[group].map((total, i) => <tr key={i}><td>{total.label}</td><td>{formatCurrency(total.tds_amount, 'INR')}</td></tr>)}</tbody>
      </table>
    </div>)}
  </>;
}
