import assert from 'node:assert/strict';
import test from 'node:test';
import { withManufacturingDrawing } from '../src/drawing/options';
import { forSheet, mergeSheet } from '../src/drawing/sheets';
import { defaultDrawing, nextSectionId, reservedSectionLetters, sectionsOf, withSections, type DrawingSettings } from '../src/drawing/types';

test('new section cannot claim a retained detail parent or sheet reference', () => {
 const original: DrawingSettings = {...defaultDrawing(), sections:[{id:'B',view:'front',at:16,removed:{}}],details:[{id:'C',view:'section:B',center:[32,4],radius:3}],sheets:[{id:'S2',views:['section:B']}]};
 const deleted=mergeSheet(original,0,withSections(forSheet(original,0),[]));
 assert.deepEqual(deleted.details,original.details);
 assert.deepEqual(deleted.sheets,original.sheets);
 const local=forSheet(deleted,0), id=nextSectionId([{id:'A',view:'front',at:0},...sectionsOf(local)],(local.details??[]).map(d=>d.id));
 const added=mergeSheet(deleted,0,withSections(local,[{id,view:'top',at:4}]));
 assert.ok(!sectionsOf(added).some(s=>s.id==='B'));
 assert.deepEqual(added.details,deleted.details);
});


test('all retained section owners reserve letters; absent owners remain unchanged', () => {
 const settings: DrawingSettings = {...defaultDrawing(), dimensions:[{id:'dim',kind:'diameter',view:'section:B',edge:'old',near:[0,0,0],place:[0,0]}], frames:[{id:'frame',view:'section:C',place:[0,0],characteristic:'flatness',value:.1,datums:[]}],details:[{id:'F',view:'section:D',center:[0,0],radius:2}],sheets:[{id:'S2',views:['section:E']}]};
 assert.deepEqual([...reservedSectionLetters(settings)],['B','C','D','E']);
 const before=structuredClone(settings);
 for(const id of ['B','C','D','E']) assert.throws(()=>withManufacturingDrawing(settings,{sections:[{id,view:'top',at:4}]}),/DRAWING_SECTION_REFERENCES/);
 assert.deepEqual(settings,before);
});

test('ordinary unannotated section edits and true deletion remain supported',()=>{
 const original: DrawingSettings={...defaultDrawing(),sections:[{id:'B',view:'top',at:4}]};
 assert.equal(sectionsOf(withManufacturingDrawing(original,{sections:[{id:'B',view:'top',at:5}]}))[0].at,5);
 assert.deepEqual(sectionsOf(withManufacturingDrawing(original,{sections:[]})),[]);
 const free=withManufacturingDrawing(defaultDrawing(),{sections:[{id:'B',view:'top',at:4}]});
 assert.equal(sectionsOf(free)[0].id,'B');
});

test('collision rename follows only newly authored detail references',()=>{
 const original: DrawingSettings={...defaultDrawing(),details:[{id:'C',view:'section:B',center:[0,0],radius:2}],sheets:[{id:'S2',views:[]}]};
 const local=forSheet(original,0);
 const next=mergeSheet(original,0,{...withSections(local,[{id:'B',view:'top',at:4}]),details:[...local.details!,{id:'E',view:'section:B',center:[1,1],radius:2}]});
 const section=sectionsOf(next)[0]; assert.notEqual(section.id,'B');
 assert.equal(next.details?.find(d=>d.id==='C')?.view,'section:B');
 assert.equal(next.details?.find(d=>d.id==='E')?.view,`section:${section.id}`);
});
