export type MeasurePickFilter = 'all' | 'face' | 'edge' | 'body';

/** Match viewportPointerInput: Bodies still supplies a face to active Measure. */
export function measurePickHint(filter: MeasurePickFilter, slot: 'from' | 'to'): string {
  const target = filter === 'all' ? 'a face, edge, or vertex' : filter === 'edge' ? 'an edge' : 'a face';
  const change = filter === 'all' ? '' : ' Change Selection filter to Pick all for faces, edges, or vertices.';
  return `Click ${target} to measure ${slot}.${change}`;
}
