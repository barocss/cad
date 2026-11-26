import { variantOf } from '@barocss/cad-model/assembly/variability';
import { rootOf } from '@barocss/cad-model/app/lookKey';
import { emptyDoc, type Dim, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';

import { isSensorWidth, sensorWidth } from './sensorWidth';

const at = (node: number) => ({ node, side: 'solid' as const });
const dim = (parameter: string): Dim => ({ parameter });
const widthOffsets = { caseWidth: 8, interiorRight: 6, boardRight: 4, rightAnchorX: -2 };

/** A bounded native model for the sensor example. All coordinates are in mm from the fixed left/front datum. */
export function buildSensorEnclosure(): StudioDoc {
  const doc = emptyDoc();
  doc.parameters = Object.fromEntries(Object.entries(widthOffsets).map(([key, offset]) => [key, sensorWidth.default + offset]));
  doc.variability = {
    version: 1,
    inputs: [{
      name: 'boardWidth', type: 'number', unit: 'mm', ...sensorWidth,
      bindings: Object.entries(widthOffsets).map(([parameter, offset]) => ({ to: 'parameter', part: 'base', parameter, offset })),
    }],
    variants: [{ name: '64 mm board', values: { boardWidth: 64 } }],
  };
  const add = (node: ModelNode) => doc.nodes.push({ ...node, id: 'n' + doc.nodes.length }) - 1;
  const box = (min: [Dim, Dim], max: [Dim, Dim], from: number, height: number) =>
    add({ kind: 'extrude', sketch: add({ kind: 'sketch', profile: 'rectangle', min, max }), from, height });
  const output = (node: number, name: string, color: string) => {
    const key = 'b' + node;
    doc.outputs[key] = at(node);
    (doc.bodies ??= {})['b' + rootOf(doc.nodes, node)] = { name, color };
  };

  // Female cavity open at the top, leaving a 2 mm floor and 2 mm walls.
  const outside = box([0, 0], [dim('caseWidth'), 42], 0, 18);
  const cavity = box([2, 2], [dim('interiorRight'), 40], 2, 18);
  const shell = add({ kind: 'difference', parent: at(outside), tool: at(cavity) });
  // A fixed 10 × 6 opening through the front wall, left of the enclosure midpoint.
  const port = box([20, -1], [30, 3], 6, 6);
  output(add({ kind: 'difference', parent: at(shell), tool: at(port) }), 'Case body', '#698ba3');
  output(box([0, 0], [dim('caseWidth'), 42], 18, 3), 'Lid', '#88a9c0');

  // PCB sits on four Ø6 supports; matching Ø2.5 bores are through the board.
  let pcb = box([4, 5], [dim('boardRight'), 37], 8, 1.6);
  for (const [side, x] of [['Left', 10], ['Right', dim('rightAnchorX')]] as const) {
    for (const [end, y] of [['front', 11], ['rear', 31]] as const) {
      const center: [Dim, Dim] = [x, y];
      const sketch = add({ kind: 'sketch', profile: 'circle', center, radius: 3 });
      output(add({ kind: 'extrude', sketch, from: 2, height: 6 }), `${side} ${end} support`, '#c39450');
      pcb = add({ kind: 'hole', parent: at(pcb), center, radius: 1.25, axis: 'z' });
    }
  }
  output(pcb, 'Sensor board', '#438d79');
  doc.nextId = doc.nodes.length;
  return doc;
}

/** Saves the applied size as the new master, rather than serializing a transient Variants result. */
export function sensorDocumentAt(width: number): StudioDoc {
  const master = buildSensorEnclosure();
  const { doc } = variantOf(master, { boardWidth: width });
  const spec = master.variability!;
  return { ...doc, variability: {
    ...spec,
    inputs: spec.inputs.map(input => ({ ...input, default: width })),
    variants: [sensorWidth.min, sensorWidth.max].filter(value => value !== width)
      .map(value => ({ name: `${value} mm board`, values: { boardWidth: value } })),
  } };
}

export const sensorSource = (width: number) => `recipe 1\nunits mm\nsensor-enclosure boardWidth=${width}\n`;
export function readSensorSource(text: string): number | null {
  if (text.length > 256) return null;
  const match = /^recipe 1\r?\nunits mm\r?\nsensor-enclosure boardWidth=(\d+(?:\.\d+)?)\r?\n?$/.exec(text);
  if (!match) return null;
  const width = Number(match[1]);
  return isSensorWidth(width) ? width : null;
}
