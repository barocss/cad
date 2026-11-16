import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import type { FeatureFailure } from './failedFeature';

/** Contact failure currently carries no station identity: never blame one of several radii. */
export function varyingFilletFailure(error: FeatureFailure, nodes: readonly ModelNode[], index: number): FeatureFailure {
  const node = nodes[index];
  if (node?.kind !== 'fillet' || !node.radii || error.feature !== featureId(nodes, index) || !/CONTACT_LEAVES_FACE/.test(error.detail)) return error;
  return { ...error, hint: 'The round leaves a supporting face. The failure does not identify a single radius. Check the Start, End and interior radii and their positions; reduce the radii or select Reset to restore the accepted values.' };
}
