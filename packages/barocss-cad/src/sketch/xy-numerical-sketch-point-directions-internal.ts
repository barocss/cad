/** A point's first-order span, not a finite trajectory or independent motion permission. */
export type PointDirection = { dimension: 1; direction: readonly [number, number] } | { dimension: 2 };

/** Singular values of the 2-by-k projected orthonormal nullspace.
 * The small value uses the norm of all 2-column determinants divided by the large
 * value (Cauchy-Binet), avoiding cancellation in trace-minus-discriminant.
 * Between the inherited arithmetic uncertainty and 16 times it, leave this point unavailable.
 */
export function projectedPointDirection(basis: readonly (readonly number[])[], point: number, uncertainty: number): PointDirection | null {
  if (!Number.isFinite(uncertainty) || uncertainty < 0) return null;
  const columns = basis.map(q => [q[2*point], q[2*point+1]]);
  if (!columns.length || columns.some(q => q.some(x => !Number.isFinite(x)))) return null;
  const scale = Math.max(...columns.flat().map(Math.abs));
  if (!(scale > 0)) return null;
  const scaled = columns.map(([x,y]) => [x/scale,y/scale]);
  let xx=0, xy=0, yy=0, minors=0;
  for (const [i,[x,y]] of scaled.entries()) {
    xx+=x*x; xy+=x*y; yy+=y*y;
    for(let j=0;j<i;j++) minors=Math.hypot(minors,x*scaled[j][1]-y*scaled[j][0]);
  }
  const largest=Math.sqrt((xx+yy+Math.hypot(xx-yy,2*xy))/2);
  const sigma1=scale*largest, sigma2=scale*(minors/largest);
  // Include accumulation roundoff without changing the upstream mobility decision.
  const error=Math.max(uncertainty,32*Number.EPSILON*columns.length*scale);
  if (!Number.isFinite(sigma1) || !Number.isFinite(sigma2) || sigma1<16*error) return null;
  if(sigma2>=16*error)return {dimension:2};
  if(sigma2>error)return null;
  const angle=.5*Math.atan2(2*xy,xx-yy);
  let x=Math.cos(angle), y=Math.sin(angle);
  // Dominant component positive avoids unstable sign choices near vertical directions.
  if(Math.abs(x)>=Math.abs(y)?x<0:y<0){x=-x;y=-y;}
  return {dimension:1,direction:[x===0?0:x,y===0?0:y]};
}
