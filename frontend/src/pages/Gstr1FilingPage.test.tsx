import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Gstr1FilingPage from './Gstr1FilingPage';

vi.mock('../context/FYContext', () => ({
  useFY: () => ({ activeFY: { start_date: '2026-04-01', end_date: '2027-03-31' } }),
}));

afterEach(() => vi.useRealTimers());

describe('Gstr1FilingPage', () => {
  it('offers only month and quarter filing presets, even when a financial year is active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15));
    const client = new QueryClient();
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <StaticRouter location="/gstr1"><Gstr1FilingPage /></StaticRouter>
        </QueryClientProvider>,
      );
      const labels = [...html.matchAll(/<button[^>]*class="scope-preset[^"]*"[^>]*>([^<]+)<\/button>/g)]
        .map((match) => match[1]);
      expect(labels).toEqual(['Last month', 'This month', 'Last quarter', 'This quarter']);
      expect(html).toMatch(/aria-pressed="true"[^>]*>Last month<\/button>/);
    } finally {
      client.clear();
    }
  });
});
