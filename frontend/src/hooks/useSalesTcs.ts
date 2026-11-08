import { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../api/client';
import type { Ledger, TaxWithholdingSection, TcsSnapshot } from '../types/api';
import { matchingSalesTcsSection, salesTcsCalculation } from '../utils/salesTcs';

type SavedTcs = TcsSnapshot & { ledger_id?: number | null; invoice_date?: string };

export function useSalesTcs(enabled: boolean, date: string, ledger?: Ledger) {
  const [sections, setSections] = useState<TaxWithholdingSection[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [amount, setAmount] = useState('');
  const [snapshot, setSnapshot] = useState<SavedTcs>();
  const [copySource, setCopySource] = useState<SavedTcs>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || !date) return;
    let cancelled = false;
    setError('');
    api.get<TaxWithholdingSection[]>('/tax-withholding-sections', { params: { kind: 'tcs', date, sales_only: true } })
      .then(async ({ data }) => {
        if (cancelled) return;
        setSections(data);
        if (copySource?.tcs_section_id && copySource.invoice_date && !data.some((row) => row.id === copySource.tcs_section_id)) {
          const old = await api.get<TaxWithholdingSection[]>('/tax-withholding-sections', { params: { kind: 'tcs', date: copySource.invoice_date.slice(0, 10), sales_only: true } });
          if (cancelled) return;
          const source = old.data.find((row) => row.id === copySource.tcs_section_id);
          const replacement = source && matchingSalesTcsSection(source, data);
          if (replacement) setSectionId(String(replacement.id));
        }
      })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Unable to load TCS sections')); });
    return () => { cancelled = true; };
  }, [enabled, date, copySource]);
  const section = sections.find((entry) => entry.id === Number(sectionId));
  const keptSnapshot = snapshot?.ledger_id === ledger?.id && snapshot?.ledger_pan === ledger?.pan ? snapshot : undefined;
  const locked = !enabled && !!snapshot?.tcs_section_id;
  const calculation = (enabled || locked) && sectionId ? salesTcsCalculation(section, ledger, amount, keptSnapshot) : undefined;
  function select(value: string) { setSectionId(value); setAmount(''); setSnapshot(undefined); setCopySource(undefined); }
  function restore(document: SavedTcs = {}, copy = false) {
    setSectionId(document.tcs_section_id ? String(document.tcs_section_id) : '');
    setAmount(document.tcs_amount != null ? String(document.tcs_amount) : '');
    setSnapshot(!copy && document.tcs_rate != null ? document : undefined);
    setCopySource(copy ? document : undefined);
  }
  return { enabled: enabled || locked, locked, sections, sectionId, amount, setAmount, select, restore, calculation,
    error: locked ? 'Enable TCS in Company settings to edit this invoice.' : error,
    declarationReceived: !!ledger?.tcs_declaration_received, hasPan: !!ledger?.pan,
    payload: { tcs_section_id: (enabled || locked) && sectionId ? Number(sectionId) : null,
      tcs_amount: (enabled || locked) && sectionId ? calculation?.amount ?? null : null },
  };
}
