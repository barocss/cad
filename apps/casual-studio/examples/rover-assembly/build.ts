import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { emptyDoc, type ModelNode, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { lockRel, solveAssembly } from '@barocss/cad-model/assembly/mates';

type XY = [number,number];
type XYZ = [number,number,number];
const ref = (node: number) => ({ node, side:'solid' as const });
const rect = (min: XY,max: XY): ModelNode => ({kind:'sketch',profile:'rectangle',min,max});
const circle = (radius: number): ModelNode => ({kind:'sketch',profile:'circle',center:[0,0],radius});
function part(name: string,color: string,profile: ModelNode,height: number,holes: [XY,number][] = []): StudioDoc {
  const nodes: ModelNode[] = [profile, {kind:'extrude',sketch:0,height}];
  for (const [center,radius] of holes) nodes.push({kind:'hole',parent:ref(nodes.length-1),center,radius,axis:'z'});
  const last = nodes.length - 1, key = 'b' + last;
  return {...emptyDoc(),nextId:nodes.length,nodes:nodes.map((n,i)=>({...n,id:'n'+i})),
    outputs:{[key]:ref(last)},bodies:{[key]:{name,color}}};
}
const chamfered = (x: number,y: number,c: number): ModelNode => ({kind:'sketch',profile:'polygon',
  points:[[-x+c,-y],[x-c,-y],[x,-y+c],[x,y-c],[x-c,y],[-x+c,y],[-x,y-c],[-x,-y+c]]});
const holes: [XY,number][] = [[[-43,-32],2.25],[[43,-32],2.25],[[-43,32],2.25],[[43,32],2.25]];
const chassis = part('Lower deck','#406981',chamfered(75,45,11),4,holes);
const lid = part('Upper deck','#668ca5',chamfered(66,41,9),4,holes);
const motor = part('Gear motor','#c69048',rect([-14,-10],[14,10]),12);
const shaft = part('Motor shaft','#cfd8de',circle(2.7),23);
const wheel = part('Wheel with axle bore','#343f4d',circle(23),13,[[[0,0],2.75]]);
const spacer = part('Deck standoff','#c99953',circle(4.8),22,[[[0,0],2.25]]);
const battery = part('Battery pack','#657380',rect([-23,-17],[23,17]),16);
const board = part('Controller board','#418977',rect([-17,-12],[17,12]),2,[[[-12,-8],1.25],[[12,8],1.25]]);
const chip = part('Controller package','#323d47',rect([-6,-5],[6,5]),3);
const support = part('Sensor bracket','#8195a7',rect([-3,-16],[3,16]),12);
const sensor = part('Range sensor board','#438a78',rect([-15,-8],[15,8]),2);
const transducer = part('Transducer','#b6c7d1',circle(6.2),5);

const placements: PartInstance[] = [];
const add = (id: string,name: string,doc: StudioDoc,position: XYZ,rotation: XYZ=[0,0,0]) => {
  placements.push({id,name,doc,position,rotation}); return id;
};
const drive: string[] = [], top: string[] = [], control: string[] = [], sense: string[] = [];
for (const [tag,x,ySign] of [['fl',48,1],['fr',48,-1],['rl',-48,1],['rr',-48,-1]] as const) {
  drive.push(add('motor-'+tag,'Motor '+tag.toUpperCase(),motor,[x,33*ySign,-12]));
  drive.push(add('axle-'+tag,'Shaft '+tag.toUpperCase(),shaft,[x,38*ySign,-6],[-90*ySign,0,0]));
  drive.push(add('wheel-'+tag,'Wheel '+tag.toUpperCase(),wheel,[x,47*ySign,-6],[-90*ySign,0,0]));
}
holes.forEach(([p],i) => top.push(add('spacer-'+(i+1),'Standoff '+(i+1),spacer,[...p,4])));
top.push(add('upper','Upper deck',lid,[0,0,26]));
control.push(add('battery','Battery pack',battery,[-31,0,30]), add('board','Controller board',board,[18,0,30]),
  add('chip','Controller package',chip,[18,0,32]));
sense.push(add('bracket','Sensor bracket',support,[62,0,30]));
// Y local → world Z, Z local → world X, for a forward-facing board and two cylinders.
sense.push(add('sensor','Range sensor board',sensor,[65,0,42],[90,0,90]));
sense.push(add('left-eye','Left transducer',transducer,[67,8,42],[90,0,90]));
sense.push(add('right-eye','Right transducer',transducer,[67,-8,42],[90,0,90]));
const doc: StudioDoc = {...chassis, instances:placements,
  mates:placements.map(p=>({ id:'m-'+p.id,kind:'lock',a:{part:'base',face:''},b:{part:p.id,face:''},rel:lockRel(null,p) })),
  assemblySteps:[
    {id:'drive',name:'Drive modules',note:'Four motor shafts pass through the wheel bores.',add:drive},
    {id:'decks',name:'Upper deck and standoffs',note:'Four spacer axes follow the same mounting grid on both decks.',add:top},
    {id:'controller',name:'Power and controller',note:'Battery and controller are placed on the upper deck.',add:control},
    {id:'sensor',name:'Front range sensor',note:'The forward-facing board seats against its bracket.',add:sense}
  ]};

const bytes = encodeStudioFile(doc), result = await readStudioFile(bytes);
if ('error' in result) assert.fail(result.error);
const reopened = result.doc;
assert.equal(reopened.instances?.length,24);
assert.equal(reopened.mates?.length,24);
assert.equal(new Set(reopened.assemblySteps!.flatMap(s => s.add)).size,24);
const evaluated = brepsFor(reopened);
if ('error' in evaluated) assert.fail(evaluated.error);
assert.equal(evaluated.breps.length,25);
for (const brep of evaluated.breps) assert.ok(brep.shells.length === 1 && brep.shells[0].closed);
const solved = solveAssembly(reopened.instances!,reopened.mates!,()=>undefined);
for (const authored of reopened.instances!) {
  const p = solved.instances.find(i=>i.id === authored.id);
  assert.ok(p);
  assert.deepEqual(p.position,authored.position);
  assert.deepEqual(p.rotation,authored.rotation);
}
assert.ok(process.argv[2], 'provide the output .bcad filename');
await writeFile(process.argv[2],bytes);
console.log('PASS: 25 closed solid bodies, 24 locked placements and four assembly steps');
