import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LedgerQuickCreateModal, { LedgerQuickCreateGstinField } from './LedgerQuickCreateModal';
import { counterpartyFor } from '../counterparty';
import type { ExistingGstinLedger } from '../../../utils/ledgerQuickCreate';

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

describe('inline GSTIN feedback (issue 1036)', () => {
  const gst = '27AAPFU0939F1ZV';
  function renderField(value: string, touched = false, duplicate?: ExistingGstinLedger | null, voucherType = 'sales') {
    return renderToStaticMarkup(<LedgerQuickCreateGstinField
      value={value} touched={touched} duplicate={duplicate} counterparty={counterpartyFor(voucherType)}
      submitting={false} onChange={() => {}} onBlur={() => {}} onUse={() => {}}
    />);
  }

  it.each(['27AAPFU0939F1Z', '00ABCDE1234F1ZG', '27ABCDE1234F1Z5'])('shows one accessible message for invalid %s', (value) => {
    const html = renderField(value, true);
    expect(html).toContain('Enter the 15-character GSTIN, like 27AAPFU0939F1ZV, or leave it blank.');
    expect(tagFor(html, 'modal-ledger-gst')).toContain('aria-invalid="true"');
    expect(tagFor(html, 'modal-ledger-gst')).toContain('aria-describedby="modal-ledger-gst-error"');
    expect(html).toContain('id="modal-ledger-gst-error" class="field-error field-error--block"');
    expect(html).not.toContain('field-hint');
  });

  it('waits until blur or the complete GSTIN to flag a first attempt', () => {
    expect(renderField('27AAP')).not.toContain('aria-invalid');
    expect(renderField('27AAP')).toContain('field-hint');
    expect(renderField('27ABCDE1234F1Z5')).toContain('aria-invalid="true"');
  });

  it.each(['', gst])('clears the message for blank or valid GSTIN: %s', (value) => {
    const html = renderField(value, true);
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('field-error');
    expect(html).toContain('field-hint');
  });

  it('names the exact existing customer and offers to select it', () => {
    const html = renderField(gst, true, { id: 42, name: 'Verma Traders', gst });
    expect(html).toContain('Verma Traders already has this GSTIN.');
    expect(html).toContain('Use Verma Traders</button>');
    expect(html).toContain('button button--ghost button--small ledger-quick-create__use-existing');
    expect(html).not.toContain('field-hint');
  });

  it.each(['sales', 'purchase'])('uses the %s fallback without a selection button when lookup fails', (voucherType) => {
    const counterparty = counterpartyFor(voucherType);
    const html = renderField(gst, true, null, voucherType);
    expect(html).toContain(`A ${counterparty.noun} with this GSTIN already exists. Search for it in the ${counterparty.label} field.`);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Ledger');
  });

  it('uses the supplier noun for an existing record with no name', () => {
    expect(renderField(gst, true, { id: 42, name: '', gst }, 'purchase')).toContain('Use supplier</button>');
  });
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
    expect(input).not.toContain('pattern=');
    expect(input).not.toContain('title=');
    expect(renderOpenModal()).toMatch(/<form[^>]*novalidate=""/);
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
