import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage, getBlobErrorMessage } from '../api/client';
import { useFY } from '../context/FYContext';
import TdsReportTable, { type TdsReport } from '../components/TdsReportTable';

export default function TdsReceivablePage() {
  const { activeFY } = useFY();
  const now = new Date();
  const [taxYear, setTaxYear] = useState(Number(activeFY?.start_date.slice(0, 4)) || now.getFullYear() - (now.getMonth() < 3 ? 1 : 0));
  const [quarter, setQuarter] = useState('');
  const [report, setReport] = useState<TdsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setReport(null);
    api.get<TdsReport>('/tds-receivable', { params: { tax_year: taxYear, quarter: quarter || undefined } })
      .then(({ data }) => { if (!cancelled) setReport(data); })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Unable to load TDS receivable')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taxYear, quarter]);

  async function exportCsv() {
    setExporting(true);
    try {
      const response = await api.get('/tds-receivable/csv', { params: { tax_year: taxYear, quarter: quarter || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `tds_receivable_${taxYear}_${quarter || 'all'}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(await getBlobErrorMessage(err, 'Unable to export TDS receivable')); }
    finally { setExporting(false); }
  }

  return <div className="panel stack">
    <h1>TDS receivable</h1>
    <p>Match customer deductions against Form 26AS or AIS. Tax years start in April; the invoice date determines the quarter.</p>
    <p>Enable customer TDS in <Link to="/company">company settings</Link> to record deductions on receipts.</p>
    <div className="form-grid">
      <label className="field">Tax year
        <select className="input" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
          {Array.from({ length: Math.max(now.getFullYear(), taxYear) - 2025 + 2 }, (_, i) => 2025 + i).map((year) => <option key={year} value={year}>{year}–{String(year + 1).slice(-2)}</option>)}
        </select>
      </label>
      <label className="field">Quarter
        <select className="input" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          <option value="">All quarters</option><option value="1">Q1 · Apr–Jun</option><option value="2">Q2 · Jul–Sep</option><option value="3">Q3 · Oct–Dec</option><option value="4">Q4 · Jan–Mar</option>
        </select>
      </label>
    </div>
    <button type="button" className="button button--secondary" disabled={loading || exporting || !report} onClick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p>Loading TDS deductions…</p> : report ? <TdsReportTable report={report} /> : null}
  </div>;
}
