import { useCallback, useRef, type RefObject } from 'react';
import { alignFaceBinding } from '@barocss/cad-model/app/alignCommand';
import { bodyName, lookOf } from '@barocss/cad-model/app/bodies';
import { refOf, type Ctx } from '@barocss/cad-model/app/commands';
import { editSavedPivotFaceCommand, savedPivotStock } from '@barocss/cad-model/app/draftEdit';
import { editSavedRevolveAxisCommand, joinedRevolveStock } from '@barocss/cad-model/app/revolveAxisEdit';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import type { EngineClient } from '../engine/client';
import type { OpenScope } from '../state/openOwnership';
import type { Active } from './commandState';

interface Options {
  model: {
    doc: StudioDoc; commandDoc: StudioDoc; editNode: number | null; marker: number | null;
    fresh: boolean; busy: boolean; bodies: readonly BodyResult[]; ctx: Ctx;
  };
  owner: {
    scope: RefObject<{ editNode: number | null }>; openIntent: RefObject<OpenScope>;
    markerNow: RefObject<number | null>; shownVariant: RefObject<string | null>;
    ownsEvaluatedSource(): boolean; canChangeDocument(): boolean; hasDraft(): boolean;
  };
  worker: { engine: Pick<EngineClient, 'part'>; revision: RefObject<number> };
  command: { discardDraft(): void; closeEditor(): void; activate(command: Active): void };
  notice(error: FriendlyError): void;
}

export function useHistoryReferenceActions({ model, owner, worker, command, notice }: Options) {
  const { doc, commandDoc, editNode, marker, fresh, busy, bodies, ctx } = model;
  const { scope, openIntent, markerNow, shownVariant, ownsEvaluatedSource, canChangeDocument, hasDraft } = owner;
  const { engine, revision } = worker;
  const readAlignHistoryTargets = useCallback(async () => {
    if (editNode === null || marker !== null || shownVariant.current || !ownsEvaluatedSource()) return [];
    const node = doc.nodes[editNode];
    if (node?.kind !== 'align' || node.suppressed) return [];
    const prefix = prefixDoc(doc, editNode);
    const result = await engine.part(prefix, revision.current++, 'refs');
    if (!ownsEvaluatedSource() || scope.current.editNode !== editNode) return [];
    if (!result.ok) throw new Error(result.error.hint);
    const source = { doc: prefix, bodies: result.bodies };
    return result.bodies.flatMap((body, index) => {
      if (!body.ref || body.ref.node === node.parent.node) return [];
      const hidden = !!lookOf(doc, body).hidden;
      if (hidden && (node.target.body.node !== body.ref.node || node.target.body.side !== body.ref.side)) return [];
      const name = bodyName(doc, body);
      return body.mesh.faces.flatMap(face => {
        const binding = alignFaceBinding(source, { body: index, face: face.index });
        if (!binding || (hidden && binding.face !== node.target.face)) return [];
        return [{ target: { ...binding, body: refOf(body) }, bodyName: name, ...(hidden ? { hidden: true as const } : {}) }];
      });
    });
  }, [doc, editNode, engine, marker, ownsEvaluatedSource, revision, scope, shownVariant]);

  const replaceRevolveAxis = editNode === null ? null : editSavedRevolveAxisCommand(commandDoc, editNode);
  const pivotStock = editNode === null ? null : savedPivotStock(commandDoc, editNode);
  const axisReplacementRequest = useRef(0);
  const pivotEditRequest = useRef(0);
  const startRevolveAxisReplacement = async () => {
    if (editNode === null || !replaceRevolveAxis || !ownsEvaluatedSource() || markerNow.current !== null || shownVariant.current
      || !fresh || busy || !canChangeDocument()) {
      notice({ title: 'Axis replacement not started', hint: 'Show the master at the latest History and wait for the model.', detail: '' });
      return;
    }
    const request = ++axisReplacementRequest.current, sourceScope = scope.current, open = openIntent.current;
    const joined = joinedRevolveStock(commandDoc, editNode);
    let stock: BodyResult | undefined;
    if (joined) {
      const current = () => request === axisReplacementRequest.current && sourceScope === scope.current
        && open === openIntent.current && ownsEvaluatedSource() && !hasDraft();
      try {
        const result = await engine.part(prefixDoc(commandDoc, editNode), revision.current++, 'refs');
        if (!current()) return;
        const candidates = result.ok ? result.bodies.filter(body => body.ref?.node === joined.stock.node
          && body.ref.side === joined.stock.side && body.key === bodyKeyFor(commandDoc.nodes, joined.stock.node, joined.stock.side)) : [];
        if (candidates.length !== 1) throw new Error('The original stock did not resolve to one source body.');
        stock = candidates[0];
      } catch (error) {
        if (current()) notice({ title: 'Axis replacement not started', hint: 'The original stock is unavailable.', detail: String(error) });
        return;
      }
      if (!canChangeDocument()) return;
    }
    command.discardDraft();
    command.closeEditor();
    command.activate({ cmd: replaceRevolveAxis, ctx: stock ? { ...ctx, bodies: [...bodies, stock] } : ctx,
      ...(joined && stock ? { joinedRevolvePick: { union: joined.union, stock } } : {}), values: {}, preview: 'busy' });
  };

  const editPivotFace = pivotStock && editNode !== null ? async () => {
    const source = scope.current, open = openIntent.current, request = ++pivotEditRequest.current;
    const ownsSource = () => open === openIntent.current && ownsEvaluatedSource()
      && markerNow.current === null && !shownVariant.current;
    const current = () => ownsSource() && source === scope.current && request === pivotEditRequest.current && !hasDraft();
    if (!fresh || busy || ctx.doc !== commandDoc || !current() || !canChangeDocument()) return;
    try {
      const result = await engine.part(prefixDoc(commandDoc, editNode), revision.current++, 'refs');
      if (!current() || !canChangeDocument()) return;
      if (!result.ok) throw new Error(result.error.hint);
      const key = bodyKeyFor(commandDoc.nodes, pivotStock.node, pivotStock.side);
      const matches = result.bodies.filter(body => body.key === key && body.ref?.node === pivotStock.node
        && body.ref.side === pivotStock.side);
      const cmd = matches.length === 1 ? editSavedPivotFaceCommand(commandDoc, editNode, matches[0]) : null;
      if (!cmd || !cmd.available(ctx).ok) throw new Error('The saved face and fixed edge must resolve on one original stock body.');
      command.discardDraft();
      command.closeEditor();
      command.activate({ cmd, ctx, values: cmd.defaults?.(ctx) ?? {}, preview: 'busy', ownsSource });
    } catch (error) {
      if (current()) notice({ title: 'Pivot face edit not started', hint: 'The original fixed edge is unavailable.', detail: String(error) });
    }
  } : undefined;

  return { readAlignHistoryTargets, replaceRevolveAxis, startRevolveAxisReplacement, editPivotFace };
}
