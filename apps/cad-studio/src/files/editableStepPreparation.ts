import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EditableStepCopy } from '@barocss/cad-model/engine/editableStepCopy';
import type { EditableStepEvidence } from '@barocss/cad-model/engine/editableStepEvidence';
import type { StepOwner } from './stepExportPreparation';

type Owner = Pick<StepOwner, 'doc' | 'evaluated' | 'shown' | 'name' | 'fresh' | 'hasBody'>;
export type EditableStepPreview =
  | { stage: 'checking'; name: string }
  | { stage: 'ready'; name: string; features: string; parameterNames: readonly string[]; evidence: EditableStepEvidence }
  | { stage: 'error'; name: string; error: string };

interface Options {
  current(): Owner;
  prepare(doc: StudioDoc): Promise<EditableStepCopy>;
  changed(preview: EditableStepPreview | null): void;
  write(doc: StudioDoc, name: string): void;
}

export function createEditableStepPreparation(options: Options) {
  let active: { owner: Owner; copy?: Extract<EditableStepCopy, { doc: StudioDoc }> } | null = null;
  const dispose = () => { active = null; };
  const cancel = () => { dispose(); options.changed(null); };
  const owns = (owner: Owner) => {
    const now = options.current();
    return now.fresh && now.hasBody && now.doc === owner.doc && now.evaluated === owner.evaluated
      && now.shown === owner.shown && now.name === owner.name;
  };
  const reconcile = () => { if (active && !owns(active.owner)) cancel(); };
  const prepare = async () => {
    const owner = options.current();
    if (!owner.fresh || !owner.hasBody) { cancel(); return; }
    const request: NonNullable<typeof active> = { owner };
    active = request;
    const name = owner.name + '-editable.bcad';
    options.changed({ stage: 'checking', name });
    let copy: EditableStepCopy;
    try {
      copy = await options.prepare(owner.doc);
    } catch (error) {
      copy = { error: error instanceof Error ? error.message : String(error) };
    }
    if (active !== request) return;
    if (!owns(owner)) { cancel(); return; }
    if ('error' in copy) { options.changed({ stage: 'error', name, error: copy.error }); return; }
    request.copy = copy;
    options.changed({ stage: 'ready', name, features: copy.family === 'plate' ? 'Sketch, Extrude, Hole' : 'Shaft',
      parameterNames: Object.keys(copy.named?.parameters ?? {}), evidence: copy.evidence });
  };
  const save = (named: boolean) => {
    if (!active?.copy) return;
    const { owner, copy } = active;
    if (!owns(owner)) { cancel(); return; }
    const doc = named ? copy.named : copy.doc;
    if (!doc) return;
    const name = owner.name + '-editable.bcad';
    cancel();
    options.write(doc, name);
  };
  return { prepare, save, cancel, reconcile, dispose };
}
