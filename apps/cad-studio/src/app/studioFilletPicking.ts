import type { Ctx, Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Active } from './commandState';
import { pickedFilletSelection, prepareFilletPick, replaceFillet, replaceFilletSelection, type FilletType, type RadiusMode } from './filletFamily';
import { filletPickFailure } from './filletPickFailure';
import type { FilletPickedEdgeRequest } from './filletPickedEdgeHighlight';

type Edge = Selection['edges'][number];
type Hit = Parameters<typeof prepareFilletPick>[2];
type Request = FilletPickedEdgeRequest | null;

interface StudioFilletPicking {
  doc: StudioDoc;
  evaluated: StudioDoc;
  context: Ctx;
  sourceIsCurrent(): boolean;
  ownsEvaluatedSource(): boolean;
  shownBodies(): readonly BodyResult[];
  current(): Active | null;
  retire(): void;
  clearApply(): void;
  set(active: Active | null): void;
  select(selection: Selection): void;
  notice(error: FriendlyError): void;
  setRequest(request: Request | ((current: Request) => Request)): void;
}

export function createStudioFilletPicking(options: StudioFilletPicking) {
  const transition = {
    current: options.current, context: () => options.context, retire: options.retire,
    clearApply: options.clearApply, set: options.set, select: options.select,
  };
  const commandIsCurrent = (owner: Active | null) =>
    options.sourceIsCurrent() && owner?.ctx.doc === options.context.doc;
  const retireCommand = () => {
    options.retire();
    options.clearApply();
    options.set(null);
  };

  return {
    changeFillet(type: FilletType, mode?: RadiusMode) {
      if (!commandIsCurrent(options.current())) {
        retireCommand();
        return;
      }
      replaceFillet(transition, type, mode);
    },
    pickFillet(hit: Hit, additive: boolean) {
      const current = options.current();
      if (!current?.fillet) return false;
      if (!commandIsCurrent(current)) {
        retireCommand();
        return true;
      }
      const selection = prepareFilletPick(current, options.shownBodies(), hit, additive, options.clearApply);
      if (selection) replaceFilletSelection(transition, selection);
      else options.notice(filletPickFailure(current));
      return true;
    },
    removeFilletEdge(owner: Active, edge: Edge) {
      if (owner !== options.current() || owner.fillet?.type !== 'edge' || !commandIsCurrent(owner)) return;
      const next = pickedFilletSelection(owner, { face: null, edge }, true);
      if (!next || next.edges.length !== owner.ctx.selection.edges.length - 1) return;
      replaceFilletSelection(transition, next);
    },
    locateFilletEdge(owner: Active, edge: Edge | null) {
      if (!edge) {
        options.setRequest(request => request?.owner.cmd === owner.cmd && request.owner.ctx === owner.ctx ? null : request);
        return;
      }
      if (owner !== options.current() || !options.sourceIsCurrent() || !options.ownsEvaluatedSource()) return;
      options.setRequest({ owner, doc: options.doc, evaluated: options.evaluated, edge });
    },
  };
}
