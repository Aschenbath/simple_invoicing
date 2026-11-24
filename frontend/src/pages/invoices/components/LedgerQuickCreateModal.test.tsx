import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LedgerQuickCreateModal from './LedgerQuickCreateModal';

/* Server rendering reads a zustand store's initial state, where the dialog is
   closed, so the store is swapped for one that has it open. */
vi.mock('../../../store/useInvoiceComposerStore', () => {
  const state = {
    showLedgerCreateModal: true,
    closeLedgerCreateModal: () => {},
    setSelectedLedgerId: () => {},
    setFeedbackError: () => {},
    setFeedbackSuccess: () => {},
  };
  return {
    useInvoiceComposerStore: (selector: (current: typeof state) => unknown) => selector(state),
  };
});

/* No DOM here, so the open dialog is read back from server-rendered markup. */
function renderOpenModal(voucherType = 'sales') {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LedgerQuickCreateModal voucherType={voucherType} />
    </QueryClientProvider>,
  );
}

function tagFor(html: string, id: string): string {
  const match = html.match(new RegExp(`<(input|textarea)[^>]*id="${id}"[^>]*>`));
  if (!match) throw new Error(`no field ${id}`);
  return match[0];
}

describe('LedgerQuickCreateModal (issue 955)', () => {
  it('lets a spaced GSTIN reach normalization without browser truncation', () => {
    const input = tagFor(renderOpenModal(), 'modal-ledger-gst');
    expect(input.toLowerCase()).not.toContain('maxlength');
    expect(input).toContain('pattern=');
  });

  it('requires only the customer name', () => {
    const html = renderOpenModal();
    expect(tagFor(html, 'modal-ledger-name')).toContain('required');
    expect(tagFor(html, 'modal-ledger-phone')).not.toContain('required');
    expect(tagFor(html, 'modal-ledger-address')).not.toContain('required');
  });

  it('does not mark phone or address with the required star', () => {
    const html = renderOpenModal();
    expect(html).toContain('>Customer name *</label>');
    expect(html).toContain('>Phone (optional)</label>');
    expect(html).toContain('>Address</label>');
  });
});

describe('short customer and supplier sheet (issue 975)', () => {
  it.each(['sales', 'purchase', 'payment'])('uses the counterparty labels for %s', (voucherType) => {
    const html = renderOpenModal(voucherType);
    const noun = voucherType === 'sales' ? 'customer' : 'supplier';
    expect(html).toContain(`>Add ${noun}</h2>`);
    expect(html).toContain(`>Save ${noun}</button>`);
    expect(html).not.toContain('Quick add');
    expect(html).not.toContain('Create ledger');
  });

  it('starts with name, telephone and GSTIN, keeping optional fields behind the disclosure', () => {
    const html = renderOpenModal();
    expect(html.indexOf('modal-ledger-name')).toBeLessThan(html.indexOf('modal-ledger-phone'));
    expect(html.indexOf('modal-ledger-phone')).toBeLessThan(html.indexOf('modal-ledger-gst'));
    expect(html).toMatch(/id="ledger-quick-create-details"[^>]*hidden=""/);
    expect(html).toContain('aria-expanded="false"');
    expect(tagFor(html, 'modal-ledger-phone')).toContain('type="tel"');
    expect(tagFor(html, 'modal-ledger-phone')).toContain('inputMode="tel"');
    expect(tagFor(html, 'modal-ledger-name')).toContain('autofocus=""');
    expect(html.indexOf('modal-ledger-address')).toBeLessThan(html.indexOf('modal-ledger-email'));
    expect(html.indexOf('modal-ledger-email')).toBeLessThan(html.indexOf('modal-ledger-opening-balance'));
    expect(html.indexOf('modal-ledger-opening-balance')).toBeLessThan(html.indexOf('modal-ledger-website'));
    expect(html).toContain('<option value="debit" selected="">They owe me</option>');
    expect(html).toContain('<option value="credit">I owe them</option>');
  });

  it('keeps the only Save control in the footer and associated with the form', () => {
    const html = renderOpenModal();
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toMatch(/ledger-quick-create__footer.*form="ledger-quick-create-form"/);
    expect(html).toContain('data-tour="save-customer"');
    expect(html.indexOf('</form>')).toBeLessThan(html.indexOf('type="submit"'));
  });
});
