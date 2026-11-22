import type { KeyboardEvent } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { prepareSketchCorner, type SketchCornerOperation } from '../sketch/cornerDraft';
import type { ConstraintInspectionStore } from '../sketch/constraintInspection';
import { useStoreValue } from '../state/valueStore';
import { Icon } from './atoms';
import { FIELD, NUM } from './panelStyles';

const tools = [
  { operation: 'fillet', label: 'Fillet', icon: 'cad-fillet', field: 'Radius' },
  { operation: 'chamfer', label: 'Chamfer', icon: 'cad-chamfer', field: 'Distance' },
] as const;

const ownKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
};

export function SketchCornerTools({ owner, source, doc, corner, inspection, onApply }: {
  owner: SketchState; source: Polygon; doc: StudioDoc; corner: number;
  inspection: ConstraintInspectionStore; onApply(shape: Polygon): void;
}) {
  const current = useStoreValue(inspection);
  const draft = current?.target === 'corner' && current.owner === owner && current.doc === doc ? current : null;
  const tool = tools.find(item => item.operation === draft?.operation);
  const result = draft?.result;
  const preview = (operation: SketchCornerOperation, value: string) => {
    inspection.set({
      target: 'corner', owner, input: 'focus', doc, operation, value,
      result: prepareSketchCorner(owner, source, doc, operation, corner, value),
    });
  };
  const apply = () => {
    const live = inspection.get();
    if (!draft || live !== draft || 'error' in draft.result) return;
    inspection.set(null);
    onApply(draft.result.shape);
  };
  return <>
    <div className="mb-1 flex gap-1" role="group" aria-label="Corner tools">
      {tools.map(item => <Button key={item.operation} type="button" data-sketch-action
        variant={item.operation === draft?.operation ? 'default' : 'outline'}
        aria-pressed={item.operation === draft?.operation} onKeyDown={ownKeyboard}
        onClick={() => { if (item.operation !== draft?.operation) preview(item.operation, '2'); }}>
        <Icon name={item.icon} small />{item.label}
      </Button>)}
    </div>
    {draft && tool && <div className="mb-1" role="group" aria-label={tool.label}>
      <label className={FIELD}><span>{tool.field}</span>
        <span className={NUM}><Input key={tool.operation} type="number" step="any" autoFocus
          min={tool.operation === 'fillet' ? 0.1 : 0} value={draft.value} aria-label={tool.field} data-sketch-action
          onChange={event => preview(tool.operation, event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            apply();
          }} /><em>mm</em></span>
      </label>
      {result && 'error' in result && <div className="sk-status open" role="alert"><i />{result.error}</div>}
      <div className="hud-actions justify-end">
        <Button type="button" variant="ghost" data-sketch-action onKeyDown={ownKeyboard}
          onClick={() => { if (inspection.get() === draft) inspection.set(null); }}>Cancel</Button>
        <Button type="button" variant="default" data-sketch-action onKeyDown={ownKeyboard}
          disabled={!result || 'error' in result} onClick={apply}>Apply</Button>
      </div>
    </div>}
  </>;
}
