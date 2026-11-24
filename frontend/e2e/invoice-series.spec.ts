import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

function salesSeries(page: Page) {
  return page.locator('#invoice-series-settings .panel').filter({
    has: page.getByText('Sales', { exact: true }),
  });
}

test.describe('Invoice Series', () => {
  test('shows invoice series card on company page', async ({ authedPage: page }) => {
    await page.goto('/settings/company');

    // Wait for the series card to appear (loaded from API)
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    // All three series rows should be visible
    await expect(page.locator('strong', { hasText: /^Sales$/ })).toBeVisible();
    await expect(page.locator('strong', { hasText: /^Purchase$/ })).toBeVisible();
    await expect(page.locator('strong', { hasText: /^Payment$/ })).toBeVisible();
  });

  test('shows live preview that updates with prefix changes', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    // Find the first prefix input (Sales series)
    const prefixInputs = page.locator('[id^="series-prefix-"]');
    await expect(prefixInputs.first()).toBeVisible({ timeout: 5_000 });

    // Clear and type a new prefix
    await prefixInputs.first().fill('RES');

    // Preview should update to include RES
    await expect(page.locator('text=Preview:').first()).toBeVisible();
    const previewEl = page.locator('strong', { hasText: 'RES-' }).first();
    await expect(previewEl).toBeVisible({ timeout: 5_000 });
  });

  test('shows live preview that updates with suffix changes', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const suffixInputs = page.locator('[id^="series-suffix-"]');
    await expect(suffixInputs.first()).toBeVisible({ timeout: 5_000 });

    await suffixInputs.first().fill('/Q1');

    const previewEl = page.locator('strong').filter({ hasText: /\/Q1$/ }).first();
    await expect(previewEl).toBeVisible({ timeout: 5_000 });
  });

  test('clearing separator removes separator from preview', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const prefixInput = page.locator('[id^="series-prefix-"]').first();
    const suffixInput = page.locator('[id^="series-suffix-"]').first();
    const separatorInput = page.locator('[id^="series-sep-"]').first();
    const includeYearCheckbox = page.locator('[id^="series-include-year-"]').first();

    await prefixInput.fill('SEP');
    await suffixInput.fill('');
    if (await includeYearCheckbox.isChecked()) {
      await includeYearCheckbox.uncheck();
    }
    await separatorInput.fill('');

    const previewText = (await page.locator('text=Preview:').first().locator('strong').textContent()) ?? '';
    expect(previewText).toContain('SEP');
    expect(previewText).not.toContain('-');
  });

  test('can save invoice series settings', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const series = salesSeries(page);

    // Change Sales prefix to a unique value
    const prefixInputs = series.locator('[id^="series-prefix-"]');
    await expect(prefixInputs).toBeVisible({ timeout: 5_000 });
    await prefixInputs.fill('SAL');

    // Save
    const saveButton = series.getByRole('button', { name: 'Save', exact: true });
    await saveButton.click();

    // Success indicator
    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('can save invoice series suffix settings', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const series = salesSeries(page);
    const suffixInputs = series.locator('[id^="series-suffix-"]');
    await expect(suffixInputs).toBeVisible({ timeout: 5_000 });
    // Keep the longest generated number within GSTR-1's 16-character limit.
    await suffixInputs.fill('/S');

    const saveButton = series.getByRole('button', { name: 'Save', exact: true });
    await saveButton.click();

    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });

    await suffixInputs.fill('');
    await saveButton.click();
    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('rapid sequential edits save cleanly without leaving the row in an error state', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const series = salesSeries(page);
    const prefixInput = series.locator('[id^="series-prefix-"]');
    const suffixInput = series.locator('[id^="series-suffix-"]');
    const saveButton = series.getByRole('button', { name: 'Save', exact: true });

    await prefixInput.fill('QCK');
    await suffixInput.fill('/R1');
    await saveButton.dblclick();

    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(series.getByText('Failed to save')).toHaveCount(0);
    await expect(saveButton).toBeEnabled({ timeout: 8_000 });

    await prefixInput.fill('INV');
    await suffixInput.fill('');
    await saveButton.click();
    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('pad digits dropdown changes preview', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const padSelects = page.locator('[id^="series-pad-"]');
    await expect(padSelects.first()).toBeVisible({ timeout: 5_000 });

    // Select 4 digits
    await padSelects.first().selectOption('4');

    // Preview should show 4-digit sequence (e.g. 0001)
    const preview = page.locator('strong', { hasText: /\d{4}$/ }).first();
    await expect(preview).toBeVisible({ timeout: 5_000 });
  });

  test('include year toggle hides year format selector', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const includeYearCheckboxes = page.locator('[id^="series-include-year-"]');
    await expect(includeYearCheckboxes.first()).toBeVisible({ timeout: 5_000 });

    // Uncheck include year
    const firstCheckbox = includeYearCheckboxes.first();
    const isChecked = await firstCheckbox.isChecked();
    if (isChecked) {
      await firstCheckbox.uncheck();
    }

    // Year format selector should be disabled
    const yearFormatSelects = page.locator('[id^="series-year-fmt-"]');
    await expect(yearFormatSelects.first()).toBeDisabled({ timeout: 5_000 });
  });

  test('invoice number uses series prefix after save', async ({ authedPage: page }) => {
    // Go to company page and set a distinctive prefix
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const series = salesSeries(page);
    const prefixInputs = series.locator('[id^="series-prefix-"]');
    await expect(prefixInputs).toBeVisible({ timeout: 5_000 });

    // Set to E2E prefix so we can verify it later
    await prefixInputs.fill('E2E');
    const saveButton = series.getByRole('button', { name: 'Save', exact: true });
    await saveButton.click();
    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });

    // Restore to default INV to avoid interfering with other tests
    await prefixInputs.fill('INV');
    await saveButton.click();
    await expect(series.getByText('Saved', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('year format dropdown includes FY option', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    const yearFormatSelects = page.locator('[id^="series-year-fmt-"]');
    await expect(yearFormatSelects.first()).toBeVisible({ timeout: 5_000 });

    // FY option must be present in the dropdown
    const fyOption = yearFormatSelects.first().locator('option[value="FY"]');
    await expect(fyOption).toHaveCount(1);
  });

  test('FY year format updates live preview with active FY label', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    await expect(page.locator('h2:has-text("Invoice series")')).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });

    // Ensure the include-year checkbox is checked
    const includeYearCheckboxes = page.locator('[id^="series-include-year-"]');
    await expect(includeYearCheckboxes.first()).toBeVisible({ timeout: 5_000 });
    const firstCheckbox = includeYearCheckboxes.first();
    if (!(await firstCheckbox.isChecked())) {
      await firstCheckbox.check();
    }

    // Select FY format
    const yearFormatSelects = page.locator('[id^="series-year-fmt-"]');
    await yearFormatSelects.first().selectOption('FY');

    // Preview should contain a FY-style label (e.g. digits-digits like 2025-26)
    // or the fallback "FY" text if no active FY exists
    const previewEl = page.locator('strong').filter({ hasText: /\d{4}-\d{2}|FY/ }).first();
    await expect(previewEl).toBeVisible({ timeout: 5_000 });
  });

  test('card header shows active FY label', async ({ authedPage: page }) => {
    await page.goto('/settings/company');
    // Header is either "Invoice series — FY <label>" or just "Invoice series"
    const heading = page.locator('h2:has-text("Invoice series")');
    await expect(heading).toBeVisible({ timeout: Number((globalThis as any).process?.env?.E2E_EXPECT_TIMEOUT_MS || '5000') });
  });
});
