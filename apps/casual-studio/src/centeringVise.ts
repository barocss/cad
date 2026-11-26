import { rootOf } from '@barocss/cad-model/app/lookKey';
import { emptyDoc, type Dim, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';

export const viseOpening = { min: 40, max: 60, default: 40 } as const;
const jawThickness = 16;
const at = (node: number) => ({ node, side: 'solid' as const });

/** A static vise geometry fixture. X=0 is the work datum, not an inferred assembly center. */
export function buildCenteringVise(): StudioDoc {
  const doc = emptyDoc();
  const bindings = [
    { parameter:'leftOutside', scale:-.5, offset:-jawThickness },
    { parameter:'leftFace', scale:-.5, offset:0 },
    { parameter:'rightFace', scale:.5, offset:0 },
    { parameter:'rightOutside', scale:.5, offset:jawThickness },
  ];
  doc.parameters = Object.fromEntries(bindings.map(b=>[b.parameter, viseOpening.default*b.scale+b.offset]));
  doc.variability = { version:1, inputs:[{
    name:'opening', type:'number', unit:'mm', ...viseOpening,
    bindings:bindings.map(b=>({ ...b, to:'parameter', part:'base' })),
  }], variants:[{ name:'60 mm opening', values:{ opening:60 } }] };

  const add = (n: ModelNode) => doc.nodes.push({...n, id:'n'+doc.nodes.length})-1;
  const block = (min: [Dim,Dim], max: [Dim,Dim], from: number, height: number) => {
    const sketch = add({kind:'sketch', profile:'rectangle', min, max});
    return add({kind:'extrude', sketch, from, height});
  };
  const output = (node: number, name: string, color: string) => {
    doc.outputs['b'+node] = at(node);
    (doc.bodies ??= {})['b'+rootOf(doc.nodes,node)] = { name, color };
  };

  let base = block([-60,-30],[60,30],0,8);
  for (const x of [-51,51]) for (const y of [-23,23]) {
    base = add({kind:'hole', parent:at(base), center:[x,y], radius:3.3, axis:'z'});
  }
  output(base,'Vise base','#567b93');
  // Position the whole jaw, including the raised grip face, from the same left/right dimensions.
  for (const [name, min, max] of [['Left jaw','leftOutside','leftFace'],['Right jaw','rightFace','rightOutside']]) {
    const lo = {parameter:min}, hi = {parameter:max};
    const slider = block([lo,-20],[hi,20],8,5);
    const grip = block([lo,-16],[hi,16],12,15);
    output(add({kind:'union',left:at(slider),right:at(grip)}),name,'#a0b7c6');
  }
  doc.nextId = doc.nodes.length;
  return doc;
}
