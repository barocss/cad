import { cageTopology, SubdError } from '@barocss/cad';
import type { CageSession } from './cageEdit';

/** Baseline cage-graph shortest edge-length distance, not Euclidean proximity. Creases are traversable.
 * Multiple seeds take minimum distance, never summed influence. Zero-length edges propagate zero distance. At and beyond radius weight is zero.
 */
export function cageProportionalWeights(s: CageSession, radius: number): number[] {
  const fail = (message: string): never => { throw new SubdError('INPUT', `proportional move: ${message}`); };
  const c = s.cage, nv = c.positions.length/3;
  const valid = (v: number) => Number.isInteger(v) && v>=0 && v<nv;
  if (!Number.isFinite(radius) || radius<=0) fail('radius must be finite and greater than zero');
  if (!Number.isInteger(nv) || c.positions.some(v=>!Number.isFinite(v)) || c.faces.some(f=>f.length<3 || new Set(f).size!==f.length || f.some(v=>!valid(v)))) fail('invalid cage coordinates or topology');
  if (s.mode!=='vertex' || !s.sel.vertices.length || s.sel.edges.length || s.sel.faces.length || s.sel.vertices.some(v=>!valid(v))) fail('pick current vertices only');
  const neighbours: [number,number][][] = Array.from({length:nv},()=>[]);
  for(const e of cageTopology(c).edges.values()) {
    const length=Math.hypot(...[0,1,2].map(k=>c.positions[3*e.a+k]-c.positions[3*e.b+k]));
    if(!Number.isFinite(length)) fail('edge length overflows; reduce coordinate range');
    neighbours[e.a].push([e.b,length]); neighbours[e.b].push([e.a,length]);
  }
  // Binary min heap: bounded Dijkstra avoids quadratic scanning on large cages.
  const heap: [number,number][]=[];
  const push=(entry:[number,number])=>{let i=heap.length;heap.push(entry);while(i>0){const p=(i-1)>>1;if(heap[p][1]<=entry[1])break;heap[i]=heap[p];i=p;}heap[i]=entry;};
  const pop=():[number,number]=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;if(last[1]<=heap[child][1])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
  const distances=Array<number>(nv).fill(Infinity);
  for(const v of new Set(s.sel.vertices)){distances[v]=0;push([v,0]);}
  while(heap.length){
    const [v,d]=pop();if(d!==distances[v])continue;
    for(const [next,length] of neighbours[v]){
      // A finite path sum overflowing is necessarily outside every finite radius.
      const candidate=d+length;
      if(candidate<radius&&candidate<distances[next]){distances[next]=candidate;push([next,candidate]);}
    }
  }
  return distances.map(d=>{if(d>=radius)return 0;const u=d/radius;return (1-u)*(1-u)*(1+2*u);});
}
