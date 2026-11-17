import type { PartInstance } from '@barocss/cad-model/engine/doc';
import { Button } from '@/components/ui/button';

/** Explicit, atomic static-assembly changes; placement and mate editing stay single-owner. */
export function SelectedInstancesPanel({ instances, onGround }: {
  instances: readonly PartInstance[]; onGround(on: boolean): void;
}) {
  const fixed = instances.filter(i => i.grounded).length;
  return <aside className="card props" aria-label="Selected placed parts">
    <div className="card-title">SELECTED PARTS · {instances.length}</div>
    <p className="small">{fixed} fixed · {instances.length - fixed} free</p>
    <p className="small muted">Ctrl/Cmd-click part rows to add or remove a selection. Changes apply to all selected parts together.</p>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button variant="ghost" disabled={fixed === instances.length} onClick={() => onGround(true)}>Fix selected in place</Button>
      <Button variant="ghost" disabled={fixed === 0} onClick={() => onGround(false)}>Unfix selected</Button>
    </div>
  </aside>;
}
