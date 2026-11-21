import type { RefObject } from 'react';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { candidatesFor, confirmReference, type Problem } from '@barocss/cad-model/engine/references';
import type { StudioNotice } from '../app/studioNotice';
import type { ReferenceFocusReceipt } from '../ui/referenceFocus';
import type { OpenScope } from './openOwnership';

export interface ReferenceChoices {
  doc: StudioDoc;
  index: number;
  names: string[];
}

interface ReferenceDecisionOptions {
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; problems: readonly Problem[] };
  owner: {
    document: RefObject<StudioDoc>;
    open: RefObject<OpenScope>;
    dispatch: RefObject<object>;
    canSettle(): boolean;
  };
  focus: {
    request: RefObject<number>;
    receipt: RefObject<ReferenceFocusReceipt<StudioDoc, OpenScope> | null>;
  };
  readPart(doc: StudioDoc): Promise<EvalResult>;
  changes: {
    pushUndo(): void;
    setDoc(doc: StudioDoc): boolean;
    remember(doc: StudioDoc, problems: Problem[]): void;
    setChoices(choices: ReferenceChoices | null): void;
    setDirty(dirty: boolean): void;
    notice(notice: StudioNotice): void;
  };
}

export function createReferenceDecisions({ model, owner, focus, readPart, changes }: ReferenceDecisionOptions) {
  const { doc, bodies, problems } = model;

  async function settleRef(index: number, to?: string, keyboardButton?: HTMLButtonElement): Promise<boolean> {
    const focusRequest = ++focus.request.current;
    focus.receipt.current = null;
    const open = owner.open.current;
    const current = () => owner.open.current === open && owner.canSettle();
    const problem = problems.find(value => value.index === index);
    const held = problem?.node == null ? undefined : doc.nodes[problem.node];
    const heldFinish = held?.held && (held.kind === 'fillet' || held.kind === 'chamfer') ? held : undefined;
    if (heldFinish && to !== undefined && to !== problem?.name && heldFinish.edges.includes(to)) {
      changes.notice({ title: 'Reference not applied', hint: 'This feature already uses that edge.', detail: to });
      return false;
    }

    const remaining = problems.filter(value => value.index !== index);
    const pending = heldFinish && problem ? remaining.find(value => value.node === problem.node) : undefined;
    const next = await confirmReference(doc, index, bodies, readPart, to, undefined, pending);
    if (!current() || next === doc) return false;
    if (heldFinish && !pending) {
      const result = await readPart(prefixDoc(next, next.nodes.length));
      if (!current()) return false;
      if (!result.ok) { changes.notice({ ...result.error, title: 'Reference not applied' }); return false; }
    }

    changes.pushUndo();
    if (!changes.setDoc(next)) return false;
    if (keyboardButton && focusRequest === focus.request.current)
      focus.receipt.current = { doc: next, scope: owner.open.current, button: keyboardButton };
    changes.remember(next, remaining);
    changes.setChoices(null);
    changes.setDirty(true);
    return true;
  }

  async function showRefChoices(index: number): Promise<void> {
    const open = owner.open.current, dispatch = owner.dispatch.current;
    const names = await candidatesFor(doc, index, bodies, readPart);
    if (owner.open.current === open && owner.dispatch.current === dispatch && owner.document.current === doc)
      changes.setChoices({ doc, index, names });
  }

  return { settleRef, showRefChoices };
}
