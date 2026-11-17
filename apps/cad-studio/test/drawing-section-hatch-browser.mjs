// #262: current section-only hatch settings, public UI/OPFS and captured export bytes.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const f = await createFlow({ name: 'drawing-section-hatch', output: process.argv[2], envFrozen: 'SECTION_HATCH_FROZEN', initialFiles: ['apps/cad-studio/test/drawing-section-hatch-browser.mjs'],
  qualification: '#262 plain part A/B hatch display, zero recut, Undo/Redo, OPFS fresh Open, captured sheet SVG/DXF/PDF.',
  limits: ['Synthetic 20×10×8 box; front A depth5 and top B depth-4 (top looks toward +Z, depth toward -Z).', 'No native-folder storage, ASME PDF claim, manufacturing approval or unsupported section forms. Download anchor intercepted after original Blob generation; no browser downloads.', 'Independent narrow DXF entity and uncompressed PDF content-stream parsers, not a general CAD/PDF viewer. Hole/detail/datum/native area proof belongs to separate Model tests.'] });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 8 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
  drawing: { sheet: 'A4', projection: 'third', hidden: true, dimensions: [], scope: { kind: 'part' }, scale: 2, sections: [{ id: 'A', view: 'front', at: 5 }, { id: 'B', view: 'top', at: -4 }] } };
const project = 'Section hatch acceptance', file = 'section-box.bcad';
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
function instrumentation() {
  const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click, urls = new Map();
  window.__hatchFiles = []; window.__hatchRequests = [];
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (request, ...rest) { window.__hatchRequests.push({ type: request?.type, id: request?.id }); return post.call(this, request, ...rest); };
  URL.createObjectURL = function (blob) { const url = create.call(this, blob); urls.set(url, blob); return url; };
  HTMLAnchorElement.prototype.click = function () { const blob = urls.get(this.href); if (blob && /\.(svg|pdf|dxf)$/.test(this.download)) { window.__hatchFiles.push({ name: this.download, blob }); urls.delete(this.href); return; } return click.call(this); };
}
async function drawing() { await button('Drawing').click(); await f.page.waitForFunction(() => window.__studioDrawing?.()?.sections?.length === 2 && window.__studioDrawing().sections.every(s => s.rings > 0 && !s.error)); }
async function groups() { return f.page.evaluate(() => {
  const root = document.querySelector('svg[aria-label="Drawing sheet"]'); if (!root) throw Error('Drawing SVG missing');
  return { A: root.querySelector('g.section[data-dim="A"]').innerHTML, B: root.querySelector('g.section[data-dim="B"]').innerHTML,
    all: root.innerHTML, drawing: window.__studioDrawing(), selection: structuredClone(window.__studioSelection) };
}); }
async function requests() { return f.page.evaluate(() => window.__hatchRequests.filter(x => x.type === 'drawing').length); }
async function capture(label) {
  const files = {};
  for (const [kind, name] of [['svg', 'Export SVG'], ['dxf', 'Export DXF'], ['pdf', 'Export PDF'], ['section.dxf', 'Export section DXF']]) {
    const n = await f.page.evaluate(() => window.__hatchFiles.length); await button(name).click();
    await f.page.waitForFunction(n => window.__hatchFiles.length > n, n);
    const data = await f.page.evaluate(async n => { const x = window.__hatchFiles[n]; return { name: x.name, bytes: Array.from(new Uint8Array(await x.blob.arrayBuffer())) }; }, n);
    const bytes = Buffer.from(data.bytes); files[kind] = bytes; await writeFile(join(f.output, `${label}.${kind}`), bytes);
    f.report.files.push({ label, kind, filename: data.name, sha256: sha256(bytes), bytes: bytes.length, boundary: 'original Blob, suppressed download anchor' });
  }
  return files;
}
// Independent group-code reader: preserve original entities, including BLOCKS; exclude only HATCH entities.
function dxf(bytes) {
  const lines = bytes.toString('utf8').replace(/\r/g, '').trimEnd().split('\n'); assert.equal(lines.length % 2, 0);
  const pairs = []; for (let i = 0; i < lines.length; i += 2) { const code = Number(lines[i].trim()); assert.ok(Number.isInteger(code)); pairs.push([code, lines[i + 1].trim()]); }
  const entities = []; let entity = [];
  for (const pair of pairs) { if (pair[0] === 0 && entity.length) { entities.push(entity); entity = []; } entity.push(pair); } if (entity.length) entities.push(entity);
  const handles = new Set(pairs.filter(p => p[0] === 5 || p[0] === 105).map(p => p[1]));
  for (const [code, target] of pairs) if ([330, 340, 350, 360].includes(code) && target !== '0') assert.ok(handles.has(target), 'DXF reference resolves: ' + target);
  const normalize = entity => entity.filter(([code], i) => ![5, 105, 330, 340, 350, 360].includes(code) && !(i > 0 && entity[i - 1][0] === 9 && entity[i - 1][1] === '$HANDSEED'));
  const hatch = entities.filter(e => e[0][0] === 0 && e[0][1] === 'HATCH');
  const unit = pairs.findIndex(p => p[0] === 9 && p[1] === '$INSUNITS'); assert.ok(unit >= 0); assert.deepEqual(pairs[unit + 1], [70, '4']);
  return { hatch: hatch.map(normalize), rest: entities.filter(e => e[0][1] !== 'HATCH').map(normalize) };
}
// Independent byte-level PDF object/xref/stream-length validation and content operator comparison.
function pdf(bytes) {
  const text = bytes.toString('latin1'); assert.ok(text.startsWith('%PDF-1.4'));
  const start = Number(text.match(/startxref\s+(\d+)/)?.[1]); assert.equal(text.slice(start, start + 4), 'xref');
  const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)]; assert.equal(streams.length, 1); assert.equal(streams[0][2].length, Number(streams[0][1]));
  assert.match(text, /\/MediaBox \[0 0 841\.8898 595\.2756\]/);
  const lines = streams[0][2].trim().split('\n'); assert.equal(lines[1], '2.8346 0 0 -2.8346 0 595.2756 cm'); return lines;
}
function removedOnly(before, after) {
  const remaining = [...before]; for (const item of after) { const index = remaining.indexOf(item); assert.ok(index >= 0, 'after contains only original operators'); remaining.splice(index, 1); } return remaining;
}
async function verifyExports(on, off) {
  const svg = await f.page.evaluate(({ on, off }) => {
    const parse = text => new DOMParser().parseFromString(text, 'image/svg+xml'); const a = parse(on), b = parse(off);
    assertXml(a); assertXml(b); function assertXml(d) { if (d.querySelector('parsererror')) throw Error('SVG parse failure'); }
    const A = d => d.querySelector('g.section[data-dim="A"]'); const B = d => d.querySelector('g.section[data-dim="B"]');
    const lines = d => [...A(d).children].map(x => x.outerHTML); const before = lines(a), after = lines(b), removed = [...before];
    for (const item of after) { const index = removed.indexOf(item); if (index < 0) throw Error('new section primitive'); removed.splice(index, 1); }
    const onlyDiagonal = removed.every(x => { const el = parse(`<svg>${x}</svg>`).documentElement.firstElementChild; return el.tagName === 'line' && el.getAttribute('x1') !== el.getAttribute('x2') && el.getAttribute('y1') !== el.getAttribute('y2'); });
    const points = [...A(b).querySelectorAll('line')].flatMap(el => [[Number(el.getAttribute('x1')), Number(el.getAttribute('y1'))], [Number(el.getAttribute('x2')), Number(el.getAttribute('y2'))]]);
    if (!points.length) throw Error('No visible contour lines');
    const contourBox = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    const sameB = B(a).innerHTML === B(b).innerHTML; A(a).innerHTML = A(b).innerHTML = '';
    return { contourBox, removed: removed.length, onlyDiagonal, sameB, restEqual: a.documentElement.outerHTML === b.documentElement.outerHTML, width: a.documentElement.getAttribute('width'), height: a.documentElement.getAttribute('height') };
  }, { on: on.svg.toString(), off: off.svg.toString() });
  assert.ok(svg.removed > 0 && svg.onlyDiagonal && svg.sameB && svg.restEqual); assert.equal(svg.width, '297mm'); assert.equal(svg.height, '210mm');
  const a = dxf(on.dxf), b = dxf(off.dxf); assert.equal(a.hatch.length, 2); assert.equal(b.hatch.length, 1); assert.deepEqual(a.rest, b.rest); assert.ok(a.hatch.some(h => JSON.stringify(h) === JSON.stringify(b.hatch[0])));
  const removed = removedOnly(pdf(on.pdf), pdf(off.pdf)); assert.equal(removed.length, svg.removed);
  const box = svg.contourBox;
  for (const line of removed) {
    const m = line.match(/ ([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S$/); assert.ok(m, line);
    const [x1, y1, x2, y2] = m.slice(1).map(Number); assert.notEqual(x1, x2); assert.notEqual(y1, y2);
    for (const [x,y] of [[x1,y1],[x2,y2]]) assert.ok(x >= box[0] - .001 && x <= box[2] + .001 && y >= box[1] - .001 && y <= box[3] + .001);
  }
  assert.deepEqual(on['section.dxf'], off['section.dxf']);
  f.report.observations.push({ exports: 'PASS', svg, dxfHatches: [2,1], pdfRemovedLineOperators: removed.length, standaloneSectionDxf: 'byte identical' });
}
async function attach() { await button('Model').click(); if (!await panel().isVisible()) await button('Project and versions').click(); await panel().getByLabel('Browser project name', { exact: true }).fill(project); await button('Project in this browser', panel()).click(); await panel().getByLabel('Project', { exact: true }).waitFor(); }
await f.run(async () => {
  const make = f.browser.newContext.bind(f.browser); f.browser.newContext = async options => { const context = await make({ ...options, acceptDownloads: false }); await context.addInitScript(instrumentation); return context; };
  await f.newPage(); await f.page.getByLabel('Model file', { exact: true }).setInputFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }); await f.page.waitForFunction(() => window.__studioDoc?.nodes?.length === 2 && window.__studioDoc.drawing?.sections?.length === 2); await f.ready(); assert.deepEqual(await f.doc(), seed);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 1600) < 1e-8);
  await drawing(); const original = await f.doc(), before = await groups(); assert.ok(before.drawing.sections.every(s => s.rings === 1));
  const on = await capture('01-on'); const count = await requests();
  await f.page.getByLabel('Section A hatch', { exact: true }).uncheck(); await f.page.waitForFunction(() => window.__studioDoc.drawing.sections.find(s => s.id === 'A').hideHatch === true);
  const hidden = await f.doc(), after = await groups(); assert.equal(after.B, before.B); assert.notEqual(after.A, before.A); assert.deepEqual(after.drawing, before.drawing); assert.deepEqual(after.selection, before.selection);
  assert.deepEqual(hidden.nodes, original.nodes); assert.deepEqual(hidden.drawing.dimensions, original.drawing.dimensions); assert.equal(await requests(), count);
  const off = await capture('02-off'); await verifyExports(on, off); await f.snapshot('02-A-hidden-B-shown');
  await button('Undo').click(); await f.same(original); assert.equal((await groups()).A, before.A); await button('Redo').click(); await f.same(hidden); assert.equal((await groups()).A, after.A); assert.equal(await requests(), count);
  await f.page.getByLabel('Section A hatch', { exact: true }).check(); await f.same(original); assert.equal((await groups()).A, before.A); assert.equal(await requests(), count);
  const restored = await capture('03-restored'); for (const kind of Object.keys(on)) assert.deepEqual(restored[kind], on[kind], kind + ' restoration');
  await f.page.getByLabel('Section A hatch', { exact: true }).uncheck(); await f.same(hidden);
  await attach(); await panel().getByLabel('Version name', { exact: true }).fill('Hatch A hidden'); await button('Make version', panel()).click(); await panel().getByLabel('Version Hatch A hidden', { exact: true }).waitFor(); await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const saved = await f.doc(); await button('Close project', panel()).click(); await f.page.reload(); await f.ready(); await attach(); await button('Open ' + file, panel()).click(); await f.same(saved); await drawing();
  assert.equal((await groups()).A, after.A); assert.equal((await groups()).B, before.B); assert.equal(await f.page.getByLabel('Section A hatch', { exact: true }).isChecked(), false); assert.equal(await f.page.getByLabel('Section B hatch', { exact: true }).isChecked(), true);
  await f.snapshot('04-fresh-OPFS-hatch-setting');
  f.report.observations.push({ geometry: { size: [20,10,8], volume: 1600, expectedCutAreas: [160,200], areaProof: 'separate Model test, not exposed by this browser hook' }, nativeDrawingRequestsDuringTogglesUndoRedo: 0, saveFreshOpen: 'PASS', scope: 'A only; B preserved', downloads: 'suppressed at original Blob boundary' });
});
