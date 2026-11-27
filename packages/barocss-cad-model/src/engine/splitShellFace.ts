import { evaluateCadPart, resolveSplitTopologySource, splitTopologyEvolutionOf, type SplitTopologyEvolutionReceipt } from '@barocss/cad';
import { prefixDoc, type ModelNode, type StudioDoc } from './doc';
import { featureId } from './ids';
import { partSnapshot } from './part';

/** Check one authored Shell opening against the native images on its own Split output. */
export function splitShellFaceChecker() {
  const receipts = new Map<number, SplitTopologyEvolutionReceipt | null>();
  return (doc: StudioDoc, shell: ModelNode | undefined, face: string): boolean | undefined => {
    if (shell?.kind !== 'shell' || shell.open.length !== 1) return;
    const { node: index, side } = shell.parent;
    if (side !== 'positive' && side !== 'negative') return;
    const split = doc.nodes[index];
    if (split?.kind !== 'split' || split.normal !== undefined || split.suppressed || split.held || split.parent.side !== 'solid') return;
    const parent = doc.nodes[split.parent.node];
    if (parent?.kind !== 'extrude' || parent.suppressed || parent.held || parent.cutDepth !== undefined
      || parent.draft !== undefined && parent.draft !== 0) return;
    const sketch = doc.nodes[parent.sketch];
    if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || sketch.suppressed || sketch.held) return;
    const owner = featureId(doc.nodes, split.parent.node);
    if (!face.startsWith(`${owner}.`) || !/^(?:top|bottom|side[0-3])$/.test(face.slice(owner.length + 1))) return;

    if (!receipts.has(index)) {
      let receipt: SplitTopologyEvolutionReceipt | null = null;
      try {
        // The native evaluator supplies both cut outputs before Studio applies its presentation filters.
        partSnapshot(prefixDoc(doc, index + 1), nativeDoc => {
          const snapshot = evaluateCadPart(nativeDoc);
          receipt = splitTopologyEvolutionOf(snapshot, featureId(doc.nodes, index));
          return snapshot;
        });
      } catch {
        receipt = null;
      }
      receipts.set(index, receipt);
    }
    const receipt = receipts.get(index);
    if (receipt?.parent.outputId !== owner) return false;
    const original = receipt.sources.find(source => source.kind === 'face' && source.name === face);
    if (!original) return false;
    const resolved = resolveSplitTopologySource(receipt, original, side);
    return resolved.status === 'unique' && resolved.image.name === face;
  };
}
