import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TcsReportTable } from './TcsCollectedPage';

vi.mock('../context/FYContext', () => ({ useFY: () => ({ activeFY: null }) }));

it('renders tax form, buyer PAN, section totals and negative credit reversals', () => {
  const html = renderToStaticMarkup(<TcsReportTable report={{ form: '143', total_tcs: -2360,
    rows: [{ invoice_id: 1, invoice_number: 'INV-1', document_number: 'CN-1', date: '2026-04-20', buyer: 'Scrap buyer',
      buyer_pan: 'ABCDE1234F', section: '394(1) Sl. No. 4', base: -118000, rate: 2, tcs: -2360 }],
    sections: [{ section: '394(1) Sl. No. 4', base: -118000, tcs: -2360 }],
  }} />);
  for (const value of ['Form 143', 'ABCDE1234F', 'CN-1', '394(1) Sl. No. 4', 'Totals by section', '-₹2,360.00', 'scope="col"']) expect(html).toContain(value);
});
