import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { readStudioFile, encodeStudioFile } from '../src/engine/container';
import { offerRevision, acceptRevision, editDefinition, dismissRevision } from '../src/assembly/definitions';
import { detachRouteBundle, routeBundleDocumentIdentity } from '../src/engine/routeBundle';
const bytes=readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/revision-route-bundle.bcad'));
const assembly=():StudioDoc=>({...emptyDoc(),instances:[{id:'p1',name:'Plate',doc:rectanglePart(12,10,8),position:[0,0,0],rotation:[0,0,0],part:{id:'shared',rev:'A'}}]});
test('a valid root route file cannot be offered as a nested revision that prevents saving',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);assert.doesNotThrow(()=>encodeStudioFile(read.doc));
 const doc=assembly(),before=structuredClone(doc),result=offerRevision(doc,'shared',read.doc,'route.bcad');
 if('doc' in result) assert.throws(()=>encodeStudioFile(result.doc),/nested route bundles/, 'baseline confirms accepted pending revision cannot be saved');
 assert.ok('error' in result,'unsupported nested revision must be refused before replacing the document');assert.deepEqual(doc,before);
});

test('definition editing cannot commit a root-only linked route child',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);const doc=assembly(),before=structuredClone(doc);
 const result=editDefinition(doc,'p1',read.doc);
 if('doc' in result) assert.throws(()=>encodeStudioFile(result.doc),/nested route bundles/);
 assert.ok('error' in result);assert.deepEqual(doc,before);
});
test('accepting an injected unsupported pending revision refuses without changing it',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);const doc={...assembly(),pendingParts:{shared:{doc:read.doc,rev:'B',name:'route.bcad'}}},before=structuredClone(doc);
 assert.throws(()=>acceptRevision(doc,'shared'),/nested route bundles/);assert.deepEqual(doc,before);
});

test('route child admission covers nested pending, schema-only and orphan markers',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);const route=read.doc;
 const nested={...emptyDoc(),instances:[{...assembly().instances![0],doc:route}]};
 const waiting={...emptyDoc(),pendingParts:{route:{doc:route,rev:'B',name:'route'}}};
 const schemaOnly={...rectanglePart(12,10,12),schema:4 as const};
 const marker=rectanglePart(12,10,12);Object.assign(marker.nodes[0],{routeBundleMember:{bundleId:'orphan',memberId:'A'}});
 for(const part of [nested,waiting,schemaOnly,marker]) {
  const doc=assembly(),before=structuredClone(doc);
  assert.ok('error' in offerRevision(doc,'shared',part,'bad.bcad'));
  assert.ok('error' in editDefinition(doc,'p1',part));
  assert.deepEqual(doc,before);
 }
});
test('ordinary and explicitly detached parts still revise; invalid waiting candidates can be replaced or dismissed',async()=>{
 const read=await readStudioFile(bytes);assert.ok('doc' in read);
 const detached=detachRouteBundle(read.doc,'bundle1',routeBundleDocumentIdentity(read.doc));
 for(const part of [rectanglePart(12,10,12),detached]) {
  const doc=assembly(),bad={...doc,pendingParts:{shared:{doc:read.doc,rev:'B',name:'route.bcad'}}};
  const offered=offerRevision(bad,'shared',part,'safe.bcad');assert.ok('doc' in offered);assert.doesNotThrow(()=>encodeStudioFile(offered.doc));
  const accepted=acceptRevision(offered.doc,'shared');assert.doesNotThrow(()=>encodeStudioFile(accepted));assert.deepEqual(accepted.instances![0].position,doc.instances![0].position);
  const edited=editDefinition(doc,'p1',part);assert.ok('doc' in edited);assert.doesNotThrow(()=>encodeStudioFile(edited.doc));
  const dismissed=dismissRevision(bad,'shared');assert.deepEqual(dismissed.instances,doc.instances);assert.doesNotThrow(()=>encodeStudioFile(dismissed));
 }
});
