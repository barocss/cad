import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { MeshCircleState } from '../app/useMeshCircleMeasurement';
import { stlCornerOccurrences } from '../files/stlCornerProvenance';
import { measureQuantityText } from './quantityText';
interface MeshCircleInspectorProps {
  state: MeshCircleState;
  ready: boolean;
  requireStl: boolean;
  onRequireStl(checked: boolean): void;
  onReset(): void;
  onBack(): void;
  onClose(): void;
}

export function MeshCircleInspector({state,ready,requireStl,onRequireStl,onReset,onBack,onClose}:MeshCircleInspectorProps){
 const value=(p:readonly number[])=>p.map(x=>measureQuantityText(x,3)).join(', ');
 const result=state.result?.ok?state.result:null;
 const fileCorners=useMemo(() => state.points.map(point => stlCornerOccurrences(point.doc, point.at)), [state.points]);
 return <aside className="card props" aria-label="Measurement" tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}}>
  <div className="card-title">REFERENCE CIRCLE (MESH)</div>
  <p>Reference circle through three selected vertices. Hole diameter and circularity are unmeasured.</p>
  <label><input type="checkbox" checked={requireStl} onChange={event => onRequireStl(event.target.checked)} /> Require STL file corners</label>
  <p className="muted">Use the All selection filter to pick edge endpoints.</p>
  <p className="muted">Current model coordinates in mm. Session only; not saved.</p>
  <p className="muted">{requireStl ? 'Use a current clean STL import. Welded file corners count as one vertex.' : 'Not original file vertex indices; welding may merge input points.'}</p>
  <p className="muted">Admission limits: minimum baseline 1e-6 mm; normalized area 1e-8; coordinate/center/radius limit 1e12 mm. These are rejection limits, not an accuracy guarantee.</p>
  {!ready&&<p role="status">Current base mesh unavailable. Close section or preview and wait for evaluation.</p>}
  <ol>{state.points.map((p,i)=>{
    const corners=fileCorners[i];
    return <li key={p.id}>{'ABC'[i]} · {p.body} · {p.id}{corners && <small className="muted" aria-label="STL file corner occurrences">
      {' · STL corners '}{corners.first.join(', ')}{corners.count > corners.first.length ? ' …' : ''}{` (${corners.count})`}
    </small>}: {value(p.at)} mm</li>;
  })}</ol>
  <p>{state.points.length<3?`Select point ${'ABC'[state.points.length]} on the same base body.`:'Reset to start a new reference circle.'}</p>
  {state.reason&&<p role="status">{state.reason}</p>}
  {result&&<dl><dt>Reference center (mm)</dt><dd>{value(result.center)}</dd><dt>Reference radius (mm)</dt><dd>{measureQuantityText(result.radius,3)}</dd><dt>Reference diameter (mm)</dt><dd>{measureQuantityText(result.diameter,3)}</dd><dt>Reference plane normal</dt><dd>{value(result.normal)}</dd></dl>}
  <Button data-measure-focus onClick={onReset}>Reset reference circle</Button>
  <Button onClick={onBack}>Two-target measurement</Button><Button onClick={onClose}>Done measuring</Button>
 </aside>;
}
