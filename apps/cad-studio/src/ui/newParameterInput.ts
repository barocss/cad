export type NewParameterInput = { ok: true; name: string; value: number } | { ok: false; field: 'name' | 'value'; message: string };
export function newParameterInput(nameText: string, valueText: string, parameters: Readonly<Record<string, number>>): NewParameterInput {
  const name = nameText.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(name)) return { ok: false, field: 'name',
    message: 'Start with a letter or underscore; use letters, digits and underscores (up to 32 characters).' };
  if (name in parameters) return { ok: false, field: 'name', message: `There is a parameter ${name} already.` };
  const value = Number(valueText);
  if (!valueText.trim() || !Number.isFinite(value)) return { ok: false, field: 'value', message: 'Enter a number. Use 0 for an explicit zero.' };
  return { ok: true, name, value };
}
