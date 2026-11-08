import { useEffect, useState } from 'react';
import api, { getApiErrorMessage, getBlobErrorMessage } from '../api/client';
import { useFY } from '../context/FYContext';
import formatCurrency from '../utils/formatting';

export type TcsReport = {
  form: string; total_tcs: number;
  rows: { invoice_id: number; document_number: string; invoice_number: string; date: string;
    buyer: string; buyer_pan: string | null; section: string; base: number; rate: number; tcs: number }[];
  sections: { section: string; base: number; tcs: number }[];
};

export function TcsReportTable({ report }: { report: TcsReport }) {
  return <>
    <p>Form {report.form} · Net TCS collected: {formatCurrency(report.total_tcs, 'INR')}</p>
    <table className="data-table"><thead><tr>
      {['Document', 'Invoice', 'Date', 'Buyer', 'PAN', 'Section', 'Base', 'Rate', 'TCS'].map((title) => <th scope="col" key={title}>{title}</th>)}
    </tr></thead><tbody>{report.rows.map((row, index) => <tr key={`${row.document_number}-${index}`}>
      <td>{row.document_number}</td><td>{row.invoice_number}</td>
      <td>{row.date}</td><td>{row.buyer}</td><td>{row.buyer_pan || 'Not provided'}</td><td>s.{row.section}</td>
      <td>{formatCurrency(row.base, 'INR')}</td><td>{row.rate}%</td><td>{formatCurrency(row.tcs, 'INR')}</td>
    </tr>)}</tbody></table>
    {!report.rows.length && <p>No TCS documents in this period.</p>}
    <h2>Totals by section</h2>
    <table className="data-table"><thead><tr><th scope="col">Section</th><th scope="col">Base</th><th scope="col">TCS</th></tr></thead>
      <tbody>{report.sections.map((row) => <tr key={row.section}><th scope="row">s.{row.section}</th><td>{formatCurrency(row.base, 'INR')}</td><td>{formatCurrency(row.tcs, 'INR')}</td></tr>)}</tbody></table>
  </>;
}

export default function TcsCollectedPage() {
  const { activeFY } = useFY();
  const now = new Date();
  const [taxYear, setTaxYear] = useState(String(Math.max(2025, Number(activeFY?.start_date.slice(0, 4)) || now.getFullYear() - (now.getMonth() < 3 ? 1 : 0))));
  const [quarter, setQuarter] = useState('');
  const [report, setReport] = useState<TcsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const validYear = /^\d{4}$/.test(taxYear) && Number(taxYear) >= 2025 && Number(taxYear) <= 2098;
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    if (!validYear) { setLoading(false); return; }
    setLoading(true); setError('');
    api.get<TcsReport>('/reports/tcs-collected', { params: { tax_year: taxYear, quarter: quarter || undefined } })
      .then(({ data }) => { if (!cancelled) setReport(data); })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Unable to load TCS collected')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taxYear, quarter, validYear]);
  async function download() {
    try {
      const { data } = await api.get('/reports/tcs-collected', { params: { tax_year: taxYear, quarter: quarter || undefined, export_csv: true }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a'); link.href = url; link.download = `tcs-collected-${taxYear}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(await getBlobErrorMessage(err, 'Unable to export TCS collected')); }
  }
  return <div className="page-grid"><section className="panel">
    <h1>TCS collected</h1><p>Sales invoices and credit reversals for the April–March tax year. Credit notes appear as negative amounts.</p>
    <div className="field-grid"><label>Tax year starting April
      <input className="input" type="number" min="2025" max="2098" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} />
    </label><label>Quarter<select className="select" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
      <option value="">Full tax year</option><option value="1">Q1 · Apr–Jun</option><option value="2">Q2 · Jul–Sep</option><option value="3">Q3 · Oct–Dec</option><option value="4">Q4 · Jan–Mar</option>
    </select></label></div>
    <button className="button" type="button" disabled={loading || !report} onClick={download}>Export CSV</button>
    {error && <p role="alert">{error}</p>}{loading && <p>Loading…</p>}
    {report && <TcsReportTable report={report} />}
  </section></div>;
}
