import type { Ledger, TaxWithholdingSection, TcsSnapshot } from '../types/api';
import type { TcsCalculation } from './invoiceTotals';

export function salesTcsCalculation(section: TaxWithholdingSection | undefined, ledger: Pick<Ledger, 'pan' | 'party_type' | 'tcs_declaration_received'> | undefined, amount: string, snapshot?: TcsSnapshot): TcsCalculation | undefined {
  if (!section && !snapshot?.tcs_section_id) return undefined;
  const normal = section ? Number(['individual', 'huf'].includes(ledger?.party_type || '') ? section.rate_individual_huf : section.rate_other) : 0;
  const rate = snapshot?.tcs_rate ?? (ledger?.pan ? normal : Math.min(20, Math.max(Number(section?.rate_no_pan || 0), normal * 2, 5)));
  return {
    rate,
    base: snapshot?.tcs_base || section?.base || 'gross',
    amount: amount !== '' ? Number(amount) : ledger?.tcs_declaration_received && section?.legacy_code === '206C(1)' ? 0 : undefined,
  };
}

export function matchingSalesTcsSection(source: TaxWithholdingSection, sections: TaxWithholdingSection[]) {
  const candidates = sections.filter((section) => section.legacy_code === source.legacy_code);
  return candidates.find((section) => section.nature === source.nature)
    ?? (candidates.length === 1 ? candidates[0] : undefined)
    ?? (source.nature.toLowerCase().includes('timber') ? candidates.find((section) => section.nature.toLowerCase().includes('timber')) : undefined);
}

export function tcsLabel(document: TcsSnapshot) {
  return `TCS @ ${Number(document.tcs_rate || 0)}% (s.${document.tcs_section_ref})`;
}
