import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TcsFields from './TcsFields';
import type { useSalesTcs } from '../hooks/useSalesTcs';

const tcs: ReturnType<typeof useSalesTcs> = {
  enabled: true, locked: false, sections: [], sectionId: '1', amount: '', setAmount: vi.fn(), select: vi.fn(), restore: vi.fn(),
  calculation: { rate: 2, base: 'gross' }, error: '', declarationReceived: true, hasPan: false,
  payload: { tcs_section_id: 1, tcs_amount: null },
};

describe('TCS fields', () => {
  it('adds no UI when the company setting is disabled', () => {
    expect(renderToStaticMarkup(<TcsFields tcs={{ ...tcs, enabled: false }} baseAmount={0} tcsAmount={0} currency="INR" />)).toBe('');
  });
  it('shows the suggestion, declaration, missing PAN, and editable actual amount', () => {
    const html = renderToStaticMarkup(<TcsFields tcs={tcs} baseAmount={118000} tcsAmount={2360} currency="INR" />);
    expect(html).toContain('Manufacturing declaration received');
    expect(html).toContain('No PAN');
    expect(html).toContain('2,360.00');
    expect(html).toContain('Amount actually collected');
    expect(html).toContain('min="0"');
  });
});
