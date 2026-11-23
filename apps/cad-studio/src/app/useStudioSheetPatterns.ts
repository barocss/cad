import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { bendTableProblem, type BendTable } from '@barocss/cad';
import { bodyName, rootOf } from '@barocss/cad-model/app/bodies';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { refOf } from '@barocss/cad-model/app/commands';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { EngineClient } from '../engine/client';
import { canOpenFlangeBendOwner, flangeBendOwners } from '../state/flangeBendOwners';
import { ownsSharedSheetRules, sameSheetRuleSource, sharedSheetRuleOwner, type SheetRuleSource } from '../state/sharedSheetRules';
import type { FlatPatternDialog } from '../ui/FlatPatternDialog';

interface SheetPatternOptions {
  source: SheetRuleSource;
  readCurrent(source: SheetRuleSource): SheetRuleSource;
  fileName: string;
  engine: EngineClient;
  nextRevision(): number;
  canChangeDocument(): boolean;
  ownsEvaluatedSource(): boolean;
  isOpenCurrent(open: object): boolean;
  openHistory(index: number, owns: () => boolean, onOpen: () => void): void;
  commit(doc: StudioDoc): void;
  onNotice(notice: FriendlyError): void;
}

/** Own the flat-pattern view and bend-table requests bound to the current sheet source. */
export function useStudioSheetPatterns({ source, readCurrent, fileName, engine, nextRevision, canChangeDocument,
  ownsEvaluatedSource, isOpenCurrent, openHistory, commit, onNotice }: SheetPatternOptions) {
  const { doc, evaluated, bodies } = source;
  const latestSource = useRef(source);
  latestSource.current = source;
  const currentSource = () => readCurrent(latestSource.current);
  const [view, setView] = useState<{ body: BodyResult; source: SheetRuleSource } | null>(null);
  const bendTableRequest = useRef<object | null>(null);

  const setFlatView = (key: string | null) => {
    const body = key === null ? undefined : bodies.find(value => value.key === key);
    setView(body ? { body, source } : null);
  };
  const closeFlatView = () => setFlatView(null);
  useEffect(() => {
    if (view && !sameSheetRuleSource(view.source, currentSource(), view.body)) setView(null);
  });

  const loadBendTable = async (body: BodyResult, file?: File) => {
    if (!file || !canChangeDocument()) return;
    const request = {}, open = currentSource().open;
    bendTableRequest.current = request;
    const current = () => bendTableRequest.current === request && currentSource().doc === doc && isOpenCurrent(open);
    let table: unknown;
    try { table = JSON.parse(await file.text()); } catch {
      if (current()) onNotice({ title: 'Not a bend table', hint: `${file.name} is not JSON.`, detail: '' });
      return;
    }
    if (!current()) return;
    const problem = bendTableProblem(table);
    if (problem) { onNotice({ title: 'Bend table refused', hint: problem, detail: '' }); return; }
    const index = rootOf(doc.nodes, refOf(body).node), node = doc.nodes[index];
    if (!node || (node.kind !== 'sheet-base' && node.kind !== 'sheet-contour')) {
      onNotice({ title: 'No sheet feature', hint: 'This body does not start from a sheet plate or profile.', detail: '' });
      return;
    }
    const { kFactor, ...sheet } = node;
    void kFactor; // A bend table replaces the scalar allowance.
    const next = { ...doc, nodes: doc.nodes.map((item, i) => i === index ? { ...sheet, bendTable: table as BendTable } : item) };
    const reply = await engine.evaluate(prefixDoc(next, next.nodes.length), nextRevision());
    if (!current() || !reply) return;
    if (!reply.ok) {
      onNotice({ ...reply.error, title: 'Bend table refused', hint: 'Check that the table covers the current bends.' });
      return;
    }
    commit(next);
  };

  let dialog: ComponentProps<typeof FlatPatternDialog> | null = null;
  if (view?.body.flat && sameSheetRuleSource(view.source, currentSource(), view.body)) {
    const { body, source: owned } = view;
    const guardedOpen = (index: number, owns: () => boolean) => {
      const canOpen = () => owns() && canChangeDocument();
      if (canOpen()) openHistory(index, canOpen, closeFlatView);
    };
    const owner = sharedSheetRuleOwner(doc, evaluated, body);
    const ownsRules = () => ownsSharedSheetRules(owned, currentSource(), body) && ownsEvaluatedSource();
    const bendActions = flangeBendOwners(owned, body).map(row => {
      const owns = () => canOpenFlangeBendOwner(owned, currentSource(), body, row) && ownsEvaluatedSource();
      return {
        featureId: row.id, bend: row.bend, disabled: !owns(),
        radiusSource: row.radiusSource === 'own' ? `own Flange ${row.id}` : `inherited from ${row.rulesId}`,
        ruleSource: `Thickness and ${row.rulesSource === 'bend-table' ? 'bend table' : 'K-factor'}: ${row.rulesId}`,
        onEdit: () => guardedOpen(row.index, owns), onEditRules: () => guardedOpen(row.rulesIndex, owns),
      };
    });
    dialog = { flat: view.body.flat, name: `${fileName}-${bodyName(doc, body)}`.replace(/[^\w.-]+/g, '_'), bendActions,
      onEditSharedRules: owner && ownsRules() ? () => guardedOpen(owner.index, ownsRules) : undefined,
      onClose: closeFlatView };
  }

  return { flatPatternOpen: view !== null, setFlatView, loadBendTable, dialog };
}
