import { useRef, type Dispatch, type SetStateAction } from 'react';
import { freshPartId, revisionOf } from '@barocss/cad-model/assembly/definitions';
import { nextInstanceId } from '@barocss/cad-model/assembly/takenIds';
import { readStudioFile } from '@barocss/cad-model/engine/container';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { insertedCurvePartProblem } from './directCurveCandidate';
import { retireStudioNotice, type StudioNotice } from './studioNotice';

interface PartInsertionOptions {
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  instanceBodies: ReadonlyMap<string, { bodies: readonly BodyResult[] }>;
  commitInstances(instances: PartInstance[], selection: string[]): boolean;
  clearSelection(): void;
  fit(): void;
  setNotice: Dispatch<SetStateAction<StudioNotice | null>>;
}

export function useStudioPartInsertion({ doc, bodies, instanceBodies, commitInstances, clearSelection, fit, setNotice }: PartInsertionOptions) {
  const failed = useRef<StudioNotice | null>(null);
  // A project document uses its link source, whereas an independently chosen file uses its file name.
  return async function insertPart(file: File, source = file.name) {
    const retried = failed.current;
    try {
      const read = await readStudioFile(new Uint8Array(await file.arrayBuffer()));
      if ('error' in read) throw new Error(read.error);
      const parsed = read.doc;
      const pathProblem = insertedCurvePartProblem(parsed);
      if (pathProblem) throw new Error(pathProblem);
      if (parsed.schema === 4 || Object.prototype.hasOwnProperty.call(parsed, 'routeBundles')) {
        throw refusal('BAD_REFERENCE', 'Route bundle: inserting a linked route document as a part is not supported. Detach the bundle first.');
      }

      // Place the new part to the right of the current root and placed bodies.
      const right = Math.max(0, ...bodies.map(body => body.mesh.bounds.max[0]),
        ...[...instanceBodies.values()].flatMap(entry => entry.bodies.map(body => body.mesh.bounds.max[0])));
      const instance: PartInstance = {
        id: nextInstanceId(doc, 'inst'),
        name: file.name.replace(/\.(bcad|json)$/i, ''),
        doc: { ...parsed, render: undefined, direct: undefined },
        position: [Math.ceil(right + 20), 0, 0],
        rotation: [0, 0, 0],
        part: { id: freshPartId(doc), rev: revisionOf(parsed), source },
      };
      if (!commitInstances([...(doc.instances ?? []), instance], [instance.id])) return;
      if (retried && failed.current === retried) {
        failed.current = null;
        setNotice(notice => retireStudioNotice(notice, retried));
      }
      clearSelection();
      setTimeout(fit, 600);
    } catch (error) {
      const notice = { title: 'Could not insert this part', hint: error instanceof Error ? error.message : String(error), detail: '' };
      failed.current = notice;
      setNotice(notice);
    }
  };
}
