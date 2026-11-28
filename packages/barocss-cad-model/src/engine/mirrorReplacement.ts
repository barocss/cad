export const mirrorReplacementPlane = 'Reflected body only requires an XY, XZ or YZ plane through the origin.';

export function mirrorReplacementProblem(node: { keep?: unknown; plane?: unknown }): string | null {
  if (node.keep !== undefined && typeof node.keep !== 'boolean') return 'Mirror keep must be true or false.';
  const { keep, plane } = node;
  return keep === false && plane !== 'xy' && plane !== 'xz' && plane !== 'yz' ? mirrorReplacementPlane : null;
}
