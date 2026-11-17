// Shared existing purchase CSV protection; authored values are never changed.
export function purchaseCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);

  const leading = value.match(/^[\s\p{Cc}\p{Cf}']*/u)![0];
  const formula = /^[=+@＝＋－＠-]/u.test(value.slice(leading.length));
  const protect = formula || /[\p{Cc}\p{Cf}]/u.test(leading);
  const text = protect ? "'" + value : value;
  return protect || /[",;\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
