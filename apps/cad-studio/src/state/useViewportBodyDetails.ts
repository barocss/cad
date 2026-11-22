import { useMemo } from 'react';
import { threadLines, threadsOf } from '@barocss/cad-model/app/threads';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { fastenerSizesOf } from '@barocss/cad-model/engine/fastenerSizeRows';
import { flattenAssembly } from '@barocss/cad-model/engine/flatten';
import type { InstanceRenderLooks } from '../viewport/instanceLook';
import { sectionHatch, sectionPlanes, type Section } from '../viewport/sectionView';
import type { useScenePoses } from './useScenePoses';

interface ViewportBodyDetails {
  doc: StudioDoc;
  nodes: ModelNode[];
  bodies: BodyResult[];
  instances: ReturnType<typeof useScenePoses>['instancesShown'];
  looks: ReadonlyMap<string, InstanceRenderLooks>;
  display: {
    rendering: boolean;
    previewBodies: BodyResult[] | null;
    steps: { hidden: ReadonlySet<string> } | null | undefined;
  };
  section: {
    view: Section | null;
    cpu: boolean;
    showHatch: boolean;
    spacing: number;
    excludedInstances: readonly string[];
  };
}

/** Prepare cosmetic details on the accepted bodies and visible assembly occurrences. */
export function useViewportBodyDetails({ doc, nodes, bodies, instances, looks, display, section }: ViewportBodyDetails) {
  const { rendering, previewBodies, steps } = display;
  const { view, cpu, showHatch, spacing, excludedInstances } = section;
  const threads = useMemo(() => {
    if (rendering || view || previewBodies) return new Float32Array();
    const own = threadsOf(nodes, fastenerSizesOf(doc)), lines: number[] = [];
    for (const body of bodies) lines.push(...threadLines(own, body.mesh));
    return new Float32Array(lines);
  }, [bodies, nodes, doc.fastenerSizes, rendering, view, previewBodies]);

  const drawn = useMemo(() => {
    if (view) return cpu && showHatch
      ? instances.map(instance => ({ ...instance, hatch: excludedInstances.includes(instance.id)
        ? [] : sectionHatch(instance.bodies, sectionPlanes(view), spacing) }))
      : instances;
    if (rendering || previewBodies) return instances;
    return instances.map(instance => {
      const definition = doc.instances?.find(item => item.id === instance.id);
      if (!definition) return instance;
      const threads = threadsOf(flattenAssembly(definition.doc).nodes, { ...fastenerSizesOf(doc), ...fastenerSizesOf(definition.doc) });
      const lines: number[] = [];
      for (const body of instance.bodies) if (!looks.get(instance.id)?.get(body.key)?.hidden) lines.push(...threadLines(threads, body.mesh));
      return lines.length ? { ...instance, threads: new Float32Array(lines) } : instance;
    });
  }, [instances, doc.instances, rendering, view, previewBodies, cpu, showHatch, spacing, looks, excludedInstances]);

  const withLooks = useMemo(() => drawn.map(instance => {
    const look = looks.get(instance.id);
    return look ? { ...instance, looks: look } : instance;
  }), [drawn, looks]);
  const instancesStepped = useMemo(() => steps?.hidden.size
    ? withLooks.filter(instance => !steps.hidden.has(instance.id)) : withLooks, [withLooks, steps]);
  return { threads, instancesStepped, hasInstances: drawn.length > 0 };
}
