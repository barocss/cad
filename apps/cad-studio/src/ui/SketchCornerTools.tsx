import type { KeyboardEvent } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Polygon } from '@barocss/cad-model/sketch/rules';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { allowsTwoSetbackChamfer, prepareSavedSketchCorners, prepareSketchCorners, type SavedSketchCorners, type SketchCornerAction } from '../sketch/cornerDraft';
import type { ConstraintInspectionStore } from '../sketch/constraintInspection';
import { useStoreValue } from '../state/valueStore';
import { Icon } from './atoms';
import { FIELD, NUM } from './panelStyles';

const tools = [
  { operation: 'fillet', label: 'Fillet', icon: 'cad-fillet', field: 'Radius' },
  { operation: 'chamfer', label: 'Chamfer', icon: 'cad-chamfer', field: 'Distance' },
] as const;
const resizeTools = {
  'resize-fillet': { operation: 'resize-fillet', label: 'Edit Fillet', icon: 'cad-fillet', field: 'Radius' },
  'resize-chamfer': { operation: 'resize-chamfer', label: 'Edit Chamfer', icon: 'cad-chamfer', field: 'Distance' },
} as const;

const ownKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
};

export function SketchCornerTools({ owner, source, doc, corners, resize, inspection, onApply }: {
  owner: SketchState; source: Polygon; doc: StudioDoc; corners: readonly number[]; resize?: SavedSketchCorners;
  inspection: ConstraintInspectionStore; onApply(shape: Polygon): void;
}) {
  const current = useStoreValue(inspection);
  const draft = current?.target === 'corner' && current.owner === owner && current.doc === doc ? current : null;
  const resizeTool = resize && resizeTools[resize.operation];
  const mixedSize = resize?.value === null;
  const choices = resizeTool ? [resize?.edges.length === 1 ? resizeTool : { ...resizeTool, label: resizeTool.label + 's' }] : tools;
  const tool = choices.find(item => item.operation === draft?.operation);
  const result = draft?.result;
  const modeAvailable = tool?.operation === 'chamfer' && allowsTwoSetbackChamfer(owner, source, doc, corners);
  const preview = (operation: SketchCornerAction, value: string, outgoing?: string) => {
    const next = operation === 'fillet' || operation === 'chamfer'
      ? prepareSketchCorners(owner, source, doc, operation, corners, value, outgoing)
      : resize?.operation === operation && prepareSavedSketchCorners(owner, source, doc, resize, value);
    if (!next) return;
    inspection.set({
      target: 'corner', owner, input: 'focus', doc, operation, resize, value, outgoing,
      corners: resize ? resize.edges.flatMap(edge => [edge, (edge + 1) % source.points.length]) : corners,
      result: next,
    });
  };
  const accepted = result && 'shape' in result && result.shape !== source ? result.shape : null;
  const apply = () => {
    if (!accepted || inspection.get() !== draft) return;
    inspection.set(null);
    onApply(accepted);
  };
  const valueField = (name: string, value: string, change: (next: string) => void, primary = false) =>
    <label className={FIELD}><span>{name}</span>
      <span className={NUM}><Input key={`${tool?.operation}:${name}`} type="number" step="any" autoFocus={primary}
        min={tool?.operation === 'fillet' ? 0.1 : 0} value={value} placeholder={mixedSize ? 'Mixed' : undefined} aria-label={name} data-sketch-action
        onChange={event => change(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          apply();
        }} /><em>mm</em></span>
    </label>;
  return <>
    <div className="mb-1 flex gap-1" role="group" aria-label="Corner tools">
      {choices.map(item => <Button key={item.operation} type="button" data-sketch-action
        variant={item.operation === draft?.operation ? 'default' : 'outline'}
        aria-pressed={item.operation === draft?.operation} onKeyDown={ownKeyboard}
        onClick={() => { if (item.operation !== draft?.operation) preview(item.operation, mixedSize ? '' : String(resize?.value ?? 2)); }}>
        <Icon name={item.icon} small />{item.label}
      </Button>)}
    </div>
    {draft && tool && <div className="mb-1" role="group" aria-label={tool.label}>
      {modeAvailable && <label className={FIELD}><span>Distance mode</span>
        <select className="h-7 rounded-md border border-input bg-card px-2 text-xs" data-sketch-action
          aria-label="Distance mode" value={draft.outgoing === undefined ? 'equal' : 'two'}
          onChange={event => preview('chamfer', draft.value, event.target.value === 'two' ? draft.value : undefined)}>
          <option value="equal">Equal</option>
          <option value="two">Two distances</option>
        </select>
      </label>}
      {valueField(draft.outgoing === undefined ? tool.field : 'Incoming distance', draft.value,
        value => preview(tool.operation, value, draft.outgoing), true)}
      {draft.outgoing !== undefined && valueField('Outgoing distance', draft.outgoing,
        value => preview(tool.operation, draft.value, value))}
      {result && 'error' in result && <div className="sk-status open" role="alert"><i />{result.error}</div>}
      <div className="hud-actions justify-end">
        <Button type="button" variant="ghost" data-sketch-action onKeyDown={ownKeyboard}
          onClick={() => { if (inspection.get() === draft) inspection.set(null); }}>Cancel</Button>
        <Button type="button" variant="default" data-sketch-action onKeyDown={ownKeyboard}
          disabled={!accepted} onClick={apply}>Apply</Button>
      </div>
    </div>}
  </>;
}
