import assert from 'node:assert/strict';
import { commands, type Ctx } from '../../src/app/commands';
import { emptyDoc, rectanglePart, type StudioDoc } from '../../src/engine/doc';
import { evaluateDoc } from '../../src/engine/evaluate';
import { editRingRows } from '../../src/engine/rings';
import { editDriveRows } from '../../src/engine/drives';
import { editConnectorRows } from '../../src/engine/connectors';
export const specs = [
 { kind:'rings',id:'ring-test',row:{id:'ring-test',shaftDiameter:20,grooveDiameter:19,grooveWidth:1.3,source:'Supplied test row'},edit:editRingRows,command:'retaining-ring' },
 { kind:'drives',id:'coupling-test',row:{kind:'coupling',id:'coupling-test',type:'rigid sleeve',bore:[12,14],outside:30,length:40,boreStep:18,estimate:true},edit:editDriveRows,command:'coupling' },
 { kind:'connectors',id:'connector-test',row:{id:'connector-test',opening:{shape:'stadium',width:8.34,height:2.56,depth:6.2},body:{shape:'stadium',width:8.25,height:2.4,length:6.51},keepOut:{margin:1,depth:15},source:'Supplied test row'},edit:editConnectorRows,command:'connector' },
] as const;
export function catalogueFixture(kind:string):StudioDoc {
 const spec=specs.find(s=>s.kind===kind)!;
 const blank:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const shaft=commands.find(c=>c.id==='shaft')!;
 const base=kind==='rings'?shaft.build!(blank,shaft.defaults!(blank)):kind==='connectors'?rectanglePart(40,20,10):emptyDoc();
 const added=spec.edit(base,[spec.row]);assert.ok('doc' in added);const r=evaluateDoc(added.doc,1);assert.ok(r.ok);
 const ctx:Ctx={doc:added.doc,bodies:r.bodies,selection:{faces:kind==='connectors'?[{body:0,face:r.bodies[0].mesh.faces.findIndex(f=>f.name.endsWith('.top'))}]:[],edges:[],bodies:kind==='rings'?[r.bodies.findIndex(b=>b.ref?.node===0)]:[]}};
 const c=commands.find(c=>c.id===spec.command)!;assert.ok(c.available(ctx).ok);const made=c.build!(ctx,c.defaults!(ctx));
 const child={...made,[spec.kind]:undefined};
 return {...emptyDoc(),[spec.kind]:{version:1,rows:[spec.row]},instances:[{id:'p1',name:spec.command,doc:child,position:[0,0,0],rotation:[0,0,0]}]};
}
