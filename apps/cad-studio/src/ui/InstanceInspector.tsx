import { InstanceBriefNotes } from './InstanceBriefNotes';
import { checkPartDelete } from '@barocss/cad-model/frames/skeleton';
import { firstProblem } from '@barocss/cad-model/engine/refusal';
import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { StudioDoc, PartInstance, ModelNode } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Mate } from '@barocss/cad-model/assembly/mates';
import { nextInstanceId } from '@barocss/cad-model/assembly/takenIds';
import { readStudioFile } from '@barocss/cad-model/engine/container';
import { acceptRevision, dismissRevision, makeIndependent, offerRevision, sharing } from '@barocss/cad-model/assembly/definitions';
import { addInstancePattern, deleteInstancePattern, editInstancePattern, patternDeleteRefusal, skipOccurrence } from '@barocss/cad-model/assembly/patterns';
import { heldLooksForInstance, heldLooks, resetInstanceLook, setInstanceLook } from '@barocss/cad-model/assembly/looks';
import { setInstanceJoints } from '@barocss/cad-model/assembly/flexible';
import type { Assembly } from '../assembly/useAssembly';
import type { BearingEditSession } from '../app/bearingEdit';
import type { StudioNotice } from '../app/studioNotice';
import { instanceLookRows } from '../state/useInstanceLooks';
import { InstancePanel } from './InstancePanel';
import { InstancePatternControls } from './InstancePattern';
import { InstanceLooksControls } from './InstanceLooks';
import { InstanceJointsControls } from './InstanceJoints';
import { NodeEditor } from './NodeEditor';
import { Icon } from './atoms';
import { ToolIconButton } from '@/components/ui/tool-button';

interface Props {
  model: { doc: StudioDoc; selectedId: string; entry: { bodies: BodyResult[] } | undefined };
  bearing: { selected: { session: BearingEditSession | null; error: string | null } | null;
    blocked: boolean; pending: boolean; close(): void; apply(session: BearingEditSession, nodes: ModelNode[]): Promise<void> };
  assembly: Pick<Assembly, 'ground' | 'without'>;
  changes: {
    commitInstances(next: PartInstance[], select?: string[]): boolean;
    commitParts(next: Pick<StudioDoc, 'instances' | 'pendingParts'>): boolean;
    commitAssembly(instances: PartInstance[], mates: Mate[]): boolean;
    patternEdit(run: () => { doc: StudioDoc }, refused?: string, inline?: boolean): string | undefined;
    startInPlace(id: string): void; clearSelection(): void;
  };
  onNotice: Dispatch<SetStateAction<StudioNotice | null>>;
}
/** Composes placed-part controls. App retains selection and all accepted-document/undo ownership. */
export function InstanceInspector({ model, bearing, assembly, changes, onNotice: setToast }: Props) {
  const { doc, selectedId, entry } = model;
  const { selected: selectedBearingEdit, blocked: bearingBlocked, pending: instanceEditPending,
    close: closeBearing, apply: applyInstanceBearing } = bearing;
  const { commitInstances, commitParts, commitAssembly, patternEdit, startInPlace, clearSelection } = changes;
  // A file chooser request belongs to this accepted document and selected inspector. A newer file
  // choice (including one that fails), selection change or unmount retires its delayed result.
  const revisionBlocked = !!selectedBearingEdit || bearingBlocked || instanceEditPending;
  const revisionRead = useRef(0), revisionOwner = useRef({ doc, selectedId, blocked: revisionBlocked });
  revisionOwner.current = { doc, selectedId, blocked: revisionBlocked };
  useLayoutEffect(() => { revisionRead.current++; return () => { revisionRead.current++; }; }, [doc, selectedId, revisionBlocked]);
  const inst = doc.instances?.find(i => i.id === selectedId);
  if (!inst) return null;
  const list = doc.instances!;
  if (selectedBearingEdit) {
    if (bearingBlocked) return null;
    const session = selectedBearingEdit.session;
    return <aside className="card props" aria-label="Part bearing properties">
      <div className="card-title">{inst.name} <ToolIconButton size="tiny" aria-label="Back to part properties" onClick={() => closeBearing()}><Icon name="arrow_back" small /></ToolIconButton></div>
      {session ? <NodeEditor key={`${session.owner}:${session.index}`} nodes={session.view.nodes} parameters={session.view.parameters} index={session.index}
        bearingAssembly={{ root: doc, owner: session.owner }} pending={instanceEditPending}
        onRefuse={hint => setToast({ title: 'Bearing not changed', hint, detail: '' })}
        onApply={nodes => void applyInstanceBearing(session, nodes)} onClose={() => closeBearing()} />
        : <div className="empty warn" role="alert">{selectedBearingEdit.error}</div>}
    </aside>;
  }
  return <InstancePanel inst={inst} bodies={entry?.bodies}
    notes={<InstanceBriefNotes doc={doc} id={inst.id} blocked={bearingBlocked || instanceEditPending} commit={commitParts} onError={hint => setToast({ title: 'Notes not changed', hint, detail: '' })} />}
    onChange={next => commitInstances(list.map(i => i.id === inst.id ? next : i))}
    onDuplicate={() => { const newId = nextInstanceId(doc, 'inst');
      // (A copy of an occurrence is a free part: not the pattern's, not fixed by it.)
      const copy: PartInstance = inst.pattern ? { ...inst, pattern: undefined, grounded: undefined } : inst;
      commitInstances([...list, { ...copy, id: newId, name: `${inst.name} copy`, position: [inst.position[0] + 20, inst.position[1] + 20, inst.position[2]] }], [newId]); }}
    onGround={on => { const why = assembly.ground(inst.id, on); if (why) setToast({ title: 'Can’t fix this part in place', hint: why, detail: '' }); }}
    shared={inst.part ? sharing(doc, inst.part.id).length : 0} pending={inst.part ? doc.pendingParts?.[inst.part.id] : undefined}
    onEditPart={() => startInPlace(inst.id)} onIndependent={() => commitParts(makeIndependent(doc, inst.id))}
    pattern={<InstancePatternControls key={inst.id} inst={inst} pattern={doc.instancePatterns?.find(p => p.seed === inst.id)} occurrenceOf={inst.pattern ? doc.instancePatterns?.find(p => p.id === inst.pattern!.id) : undefined}
      onAdd={o => patternEdit(() => addInstancePattern(doc, o), 'Pattern not changed', true)} onEdit={o => patternEdit(() => editInstancePattern(doc, o), 'Pattern not changed', true)}
      onDelete={id => patternEdit(() => deleteInstancePattern(doc, id))} onSkip={() => { patternEdit(() => skipOccurrence(doc, inst.id)); clearSelection(); }} />}
    looks={<InstanceLooksControls rows={instanceLookRows(inst, entry, doc)} readOnly={!!inst.pattern}
      held={heldLooksForInstance(doc, inst.id)}
      onSet={(key, patch) => patternEdit(() => setInstanceLook(doc, { part: inst.id, body: key, patch }), 'Look not changed')}
      onReset={(key, field) => patternEdit(() => resetInstanceLook(doc, { part: inst.id, body: key, field }), 'Look not changed')} />}
    joints={inst.doc.instances?.length ? <InstanceJointsControls inst={inst}
      onSet={values => patternEdit(() => setInstanceJoints(doc, { part: inst.id, joints: values }), 'Joints not changed')}
      onReset={() => patternEdit(() => setInstanceJoints(doc, { part: inst.id, joints: {}, replace: true }), 'Joints not changed')} /> : undefined}
    onRevision={async file => {
      const request = ++revisionRead.current;
      const current = () => request === revisionRead.current && revisionOwner.current.doc === doc && revisionOwner.current.selectedId === selectedId && !revisionOwner.current.blocked;
      if (!current()) return;
      try {
        const read = await readStudioFile(new Uint8Array(await file.arrayBuffer()));
        if (!current()) return;
        if ('error' in read) { setToast({ title: 'Could not read that part', hint: read.error, detail: '' }); return; }
        const r = offerRevision(doc, inst.part!.id, read.doc, file.name);
        if ('error' in r) setToast({ title: 'Nothing to update', hint: r.error, detail: '' }); else if (commitParts(r.doc)) {
          // The occurrences' own looks stay; those whose body the revision lacks are held when accepted.
          if (r.held.length) setToast({ title: `${r.held.length} look${r.held.length > 1 ? 's' : ''} would be held`, hint: r.held.map(h => h.problem).join(' '), detail: '' });
        }
      } catch (error) {
        if (current()) setToast({ title: 'Could not read that part', hint: error instanceof Error ? error.message : String(error), detail: '' });
      }
    }}
    onAccept={() => { let next: StudioDoc; try { next = acceptRevision(doc, inst.part!.id); } catch (e) { setToast({ title: 'Revision not accepted', hint: e instanceof Error ? e.message : String(e), detail: '' }); return; } const held = heldLooks(next); commitParts(next);
      if (held.length) setToast({ title: `${held.length} look${held.length > 1 ? 's' : ''} held`, hint: held.map(h => h.problem).join(' '), detail: '' }); }} onDismiss={() => commitParts(dismissRevision(doc, inst.part!.id))}
    onRemove={() => {
      const held = patternDeleteRefusal(doc, inst.id); if (held) { setToast({ title: 'Can’t remove this part', hint: held.message, detail: '' }); return; }
      const followed = firstProblem(checkPartDelete(doc, inst.id)); if (followed) { setToast({ title: 'Can’t remove this part', hint: followed, detail: '' }); return; }
      if (!commitAssembly(list.filter(i => i.id !== inst.id), assembly.without(inst.id))) return; clearSelection(); }} />;
}
