import type { ModelNode } from '../engine/doc';

export function splitNormalProblem(normal: readonly number[]): string | null {
  return normal.length === 3 && normal.every(Number.isFinite) && normal.some(value => value !== 0)
    ? null : 'Give the plane a direction: its normal must not be zero.';
}

/** Basic direction validation shared by creation and History; native scale limits remain authoritative. */
export function splitPlaneProblem(node: ModelNode | undefined): string | null {
  return node?.kind === 'split' && node.normal !== undefined ? splitNormalProblem(node.normal) : null;
}

/** Current edit coefficients, without the abbreviated History label's rounding. */
export function splitPlaneText(normal: readonly number[]): string {
  return normal.flatMap((value, index) => value === 0 ? [] : [{ value, axis: 'XYZ'[index] }])
    .map(({ value, axis }, index) => `${value < 0 ? '−' : index ? '+' : ''}${Math.abs(value) === 1 ? '' : String(Math.abs(value))}${axis}`).join('') || '0';
}
