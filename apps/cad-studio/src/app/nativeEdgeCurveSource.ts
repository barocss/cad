import type { NurbsCurve } from '@barocss/cad-model/engine/curveSource';
/** Expand the shortest round-trip decimal without changing its value; the source grammar has no exponents. */
export function exactDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Native curve contains a non-finite value.');
  if (Object.is(value, -0)) return '-0';
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const negative = text.startsWith('-'), [mantissa, exponent] = text.replace(/^-/, '').split(/[eE]/);
  const point = (mantissa.indexOf('.') < 0 ? mantissa.length : mantissa.indexOf('.')) + Number(exponent);
  const digits = mantissa.replace('.', '');
  const decimal = point <= 0 ? '0.' + '0'.repeat(-point) + digits
    : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
  return (negative ? '-' : '') + decimal;
}
export function nativeEdgeCurveSource(curves: readonly NurbsCurve[]): string {
  if (!curves.length || curves.length > 16) throw new Error('Select between 1 and 16 native edges.');
  return '@model edges { version: 0; length-unit: mm;\n' + curves.map((c, i) =>
    `@curve #c${i + 1} { type: nurbs; degree: ${exactDecimal(c.degree)}; knots: [${c.knots.map(exactDecimal)}]; control-points: [${c.points.map(p => `[${p.map(exactDecimal)}]`)}]; weights: [${c.weights.map(exactDecimal)}]; }`).join('\n') + '\n}';
}
