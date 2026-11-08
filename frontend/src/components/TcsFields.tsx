import type { useSalesTcs } from '../hooks/useSalesTcs';
import formatCurrency from '../utils/formatting';

type Props = { tcs: ReturnType<typeof useSalesTcs>; baseAmount: number; tcsAmount: number; currency: string };

export default function TcsFields({ tcs, baseAmount, tcsAmount, currency }: Props) {
  if (!tcs.enabled) return null;
  const section = tcs.sections.find((entry) => entry.id === Number(tcs.sectionId));
  return <fieldset className="field field--full">
    <legend>TCS on sales</legend>
    {tcs.error && <p role="alert">{tcs.error}</p>}
    <label>Section
      <select className="select" disabled={tcs.locked} value={tcs.sectionId} onChange={(e) => tcs.select(e.target.value)}>
        <option value="">No TCS</option>
        {tcs.sectionId && !section && <option value={tcs.sectionId}>Review section for this date</option>}
        {tcs.sections.map((entry) => <option key={entry.id} value={entry.id}>{entry.nature} — s.{entry.section_ref}</option>)}
      </select>
    </label>
    {tcs.declarationReceived && <p className="field-hint">Manufacturing declaration received: no TCS is suggested. Review its applicability.</p>}
    {tcs.sectionId && <>
      {!tcs.hasPan && <p className="field-hint">No PAN: the higher TCS rate applies.</p>}
      {section?.threshold_single && <p className="field-hint">Applies above {formatCurrency(section.threshold_single, currency)} ({section.threshold_note}). Check applicability.</p>}
      <p>Base {formatCurrency(baseAmount, currency)} · Rate {tcs.calculation?.rate ?? 0}% · TCS {formatCurrency(tcsAmount, currency)}</p>
      <label>Amount actually collected (optional)
        <input className="input" type="number" disabled={tcs.locked} min="0" max="99999999.99" step="0.01" value={tcs.amount}
          placeholder="Use suggested amount" onChange={(e) => tcs.setAmount(e.target.value)} />
      </label>
    </>}
  </fieldset>;
}
