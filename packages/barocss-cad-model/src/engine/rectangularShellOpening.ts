/** Original named faces of an upright, unmodified rectangle extrusion. */
export const rectangularShellFaces = [
  { value: 'top', label: 'Top', suffix: 'top', axis: 2, side: 1 },
  { value: 'bottom', label: 'Bottom', suffix: 'bottom', axis: 2, side: 0 },
  { value: 'left', label: 'Left', suffix: 'side3', axis: 0, side: 0 },
  { value: 'right', label: 'Right', suffix: 'side1', axis: 0, side: 1 },
  { value: 'front', label: 'Front', suffix: 'side0', axis: 1, side: 0 },
  { value: 'back', label: 'Back', suffix: 'side2', axis: 1, side: 1 },
] as const;

export function rectangularShellOpening(open: readonly string[], owner: string) {
  if (open.length === 0) return 'closed';
  if (open.length === 1) return rectangularShellFaces.find(face => open[0] === `${owner}.${face.suffix}`)?.value;
}
