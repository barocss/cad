// D155 on the drawing (the kernel lane's request, D139 with the outer lane): a diameter dimension on a face that carries
// a tolerance class (doc.fits) reads its class and its limits from the user's tables — `Ø50 H7 (+0.025/0)`, or for a
// declared hole–shaft pair `Ø50 H7/k6 (+0.025/0, +0.018/+0.002)` — each limit as its table's row gives it (the kernel's
// lookupFit / fitLimits at the dimension's own size), `(est.)` after it when a row is an estimate. No limit is built in:
// a class with no row for that size keeps its class alone and is a typed issue (FIT_ROW_MISSING) saying what to load.
import { fitLimits, isHoleClass, lookupFit, FitError } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { UNPRINTABLE_FIT_LIMITS, type LengthFormat } from './standard';

/** A length as the sheet's units print it (11 ③b; absent: mm, as before). */
const plainMM: LengthFormat = (mm, places = 2) => String(+mm.toFixed(places));
/**
 * The deviations of a fit's tolerances `upper/lower` in a format's unit, at common decimals, with the nominal at the same
 * decimals (standard.ts `deviationSet`: the nominal rounds to nearest, the deviations inward from the true limits, so the
 * printed limits never lie outside the zone). Without a unit format (mm, as before) they are as the table gives them.
 */
function limitsOf(list: readonly (readonly [number, number])[], diameter: number, f: LengthFormat): { texts: string[]; digits?: number } {
  if (!f.pairs) return { texts: list.map(([u, l]) => `${deviation(u)}/${deviation(l)}`) };
  const set = f.pairs(list, diameter);
  return { texts: set.items.map(d => d.printable ? `${d.upper}/${d.lower}` : UNPRINTABLE_FIT_LIMITS), digits: set.digits };
}

/** A deviation (mm) as drawings write it: +0.025, 0, -0.009 (ASCII, as the PDF's fonts show). */
export const deviation = (mm: number, f: LengthFormat = plainMM) => mm === 0 ? '0' : `${mm > 0 ? '+' : '-'}${f(Math.abs(mm), 4)}`;

/** The class an edge's face carries: a face of the edge's name (`face|face`) by its name, or the name without `#k`. */
function classedFace(doc: StudioDoc, edge: string): { face: string; class: string } | null {
  const faces = doc.fits?.faces ?? [];
  for (const name of edge.split('|')) {
    const base = name.replace(/#\d+$/, ''), hit = faces.find(f => f.face === name || f.face === base);
    if (hit) return hit;
  }
  return null;
}

type FitAnnotation = { class: string; limits: readonly (readonly [number, number])[]; estimate: boolean }
  | { class: string; miss: string };

function fitAnnotation(doc: StudioDoc, edge: string, diameter: number): FitAnnotation | null {
  const own = classedFace(doc, edge);
  if (!own) return null;
  const tables = doc.fits?.tables ?? [], pairs = doc.fits?.pairs ?? [];
  const pair = pairs.find(p => p.hole === own.face || p.shaft === own.face), other = pair ? doc.fits?.faces?.find(f => f.face === (pair.hole === own.face ? pair.shaft : pair.hole)) : undefined;
  if (other) {
    const [hc, sc] = isHoleClass(own.class) ? [own.class, other.class] : [other.class, own.class];
    const cls = `${hc}/${sc}`;
    try {
      const fit = fitLimits(tables, hc, sc, diameter);
      return { class: cls, limits: [[fit.hole.upper, fit.hole.lower], [fit.shaft.upper, fit.shaft.lower]], estimate: fit.estimate };
    } catch (e) {
      if (!(e instanceof FitError)) throw e;
      return { class: `${own.class}/${other.class}`, miss: e.message };
    }
  }
  try {
    const fit = lookupFit(tables, own.class, diameter);
    return { class: own.class, limits: [[fit.upper, fit.lower]], estimate: fit.estimate };
  } catch (e) {
    if (!(e instanceof FitError)) throw e;
    return { class: own.class, miss: e.message };
  }
}

/**
 * The fit a diameter dimension on `edge` at `diameter` shows, after its size: its class and limits (a pair's both),
 * or the class alone with why its limits are missing; null when no face of the edge carries a class.
 */
export function fitCallout(doc: StudioDoc, edge: string, diameter: number, f: LengthFormat = plainMM): { text: string; miss?: string; digits?: number } | null {
  const fit = fitAnnotation(doc, edge, diameter);
  if (!fit) return null;
  if ('miss' in fit) return { text: fit.class, miss: fit.miss };
  const d = limitsOf(fit.limits, diameter, f);
  return { text: `${fit.class} (${d.texts.join(', ')})${fit.estimate ? ' (est.)' : ''}`, ...(d.digits !== undefined ? { digits: d.digits } : {}) };
}

/** Exact deviations for proposal review, independent of drawing units and printed rounding. */
export function fitForReview(doc: StudioDoc, edge: string, diameter: number): string | undefined {
  const fit = fitAnnotation(doc, edge, diameter);
  if (!fit) return;
  if ('miss' in fit) return fit.class + ' (limits unavailable)';
  const limits = fit.limits.map(([upper, lower]) => `${deviation(upper, String)}/${deviation(lower, String)}`);
  return `${fit.class} (${limits.join(', ')})${fit.estimate ? ' (est.)' : ''}`;
}

/** A diameter dimension's callout with its fit: the hole's callout (or Ø and the size), then the fit, when the edge's face carries a class. */
export function withFit(doc: StudioDoc, hole: (edge: string, f?: LengthFormat) => string | null): (edge: string, diameter?: number, f?: LengthFormat) => string | null {
  return (edge, diameter, f = plainMM) => {
    if (diameter === undefined) return hole(edge, f);
    // (The size prints at the decimals of its fit's deviations.)
    const fit = fitCallout(doc, edge, diameter, f), g = fit?.digits !== undefined && f.at ? f.at(fit.digits) : f, base = hole(edge, g);
    return fit ? `${base ?? `Ø${g(diameter, 3)}`} ${fit.text}` : base;
  };
}
/** Why a diameter dimension's fit has no limits (the class has no row for that size), or null. */
export function fitMiss(doc: StudioDoc): (edge: string, diameter: number) => string | null {
  return (edge, diameter) => fitCallout(doc, edge, diameter)?.miss ?? null;
}
