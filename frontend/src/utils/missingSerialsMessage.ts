/** The line numbers are the visible, one-based positions in the invoice. */
export function missingSerialsMessage(lineNumbers: number[]): string {
  if (lineNumbers.length === 0) return '';
  if (lineNumbers.length === 1) {
    return `Line ${lineNumbers[0]} has no serial number yet. Add one to create the invoice.`;
  }
  const lines = `${lineNumbers.slice(0, -1).join(', ')} and ${lineNumbers[lineNumbers.length - 1]}`;
  return `Lines ${lines} have no serial number yet. Add one to each to create the invoice.`;
}
