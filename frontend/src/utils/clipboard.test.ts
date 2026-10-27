import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

afterEach(() => vi.unstubAllGlobals());

describe('copyTextToClipboard', () => {
  test('copies the supplied invoice number exactly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyTextToClipboard('INV-0007/26')).toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith('INV-0007/26');
  });

  test('reports clipboard rejection without throwing', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });

    await expect(copyTextToClipboard('INV-7')).resolves.toBe(false);
  });

  test('handles missing clipboard access on insecure origins', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyTextToClipboard('INV-7')).resolves.toBe(false);
  });

  test('handles environments with no navigator', async () => {
    vi.stubGlobal('navigator', undefined);

    await expect(copyTextToClipboard('INV-7')).resolves.toBe(false);
  });
});
