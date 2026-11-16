import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { KeepoutResult } from '@barocss/cad-model/engine/schema/references';
import type { EngineClient } from '../engine/client';

/** A verdict describes accepted geometry, not an active command's preview. */
export interface KeepoutSource {
  evaluated: StudioDoc;
  references: StudioDoc['references'];
  bodies: BodyResult[];
  engine: EngineClient;
  fresh: boolean;
  busy: boolean;
}
export interface KeepoutReceipt { source: KeepoutSource; verdicts: KeepoutResult[] }
export function keepoutSourceCurrent(source: KeepoutSource, current: KeepoutSource): boolean {
  return source.fresh && !source.busy && current.fresh && !current.busy
    && source.evaluated === current.evaluated && source.references === current.references
    && source.bodies === current.bodies && source.engine === current.engine;
}
export function currentKeepoutVerdicts(receipt: KeepoutReceipt | null, current: KeepoutSource): KeepoutResult[] | null {
  return receipt && keepoutSourceCurrent(receipt.source, current) ? receipt.verdicts : null;
}
