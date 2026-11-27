import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

// Open the actual file written by the local MCP session, then edit and save it in Studio.
const [output, input] = process.argv.slice(2);
assert.ok(output && input, 'Supply an external output directory and the MCP-authored box file');
const bytes = await readFile(resolve(input));
const source = JSON.parse(bytes);
const index = source.nodes.findIndex(node => node.kind === 'extrude');
assert.ok(index >= 0);
const extrusion = source.nodes[index], sketch = source.nodes[extrusion.sketch];
assert.equal(extrusion.height, 12);
assert.equal(sketch.profile, 'rectangle');
assert.deepEqual([sketch.min, sketch.max], [[0, 0], [40, 20]]);
const edited = structuredClone(source);
edited.nodes[index].height = 16;
// Editing the underlying extrusion invalidates the original Box command recipe.
delete edited.nodes[index].made;

const pins = [
  'apps/cad-studio/test/agent-review-part-mcp.mjs',
  'apps/cad-studio/test/agent-review-part-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/files/useStudioDocumentFiles.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/app/editFields.ts',
];
const flow = await createFlow({
  name: 'agent-review-part', output, envFrozen: 'AGENT_REVIEW_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Open an MCP-authored part, edit its extrusion, Save, and reopen in a fresh Studio session.',
  limits: ['One rectangular stock part. The original 9600 mm³ volume requirement stays in the document after the user edits the height.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep }) => ({
  valid: checkBrep(brep, { strict: true }).valid, volume: brepMassProperties(brep, 1).volume,
  corners: brep.vertices.map(vertex => vertex.point), faces: brep.faces.length, edges: brep.edges.length,
  faceNames: brep.faces.map(face => face.name),
}))));
`,
  oracleSource: `
import itertools, json, math, sys
r = json.load(sys.stdin)
body, = r['solids']
h = r['height']
expected = 40 * 20 * h
assert body['valid']
assert abs(body['volume'] - expected) < 1e-7
assert abs(r['workerVolume'] - expected) < 1e-7
assert (len(body['corners']), body['faces'], body['edges']) == (8, 6, 12)
for corner in itertools.product([0, 40], [0, 20], [0, h]):
    assert any(math.dist(corner, actual) < 1e-9 for actual in body['corners'])
print(json.dumps({'status': 'PASS', 'expectedVolume': expected, 'nativeVolume': body['volume']}))
`,
});
async function verify(label, doc) {
  await flow.same(doc);
  const { bodies } = await flow.bodies();
  assert.equal(bodies.length, 1);
  const solids = await flow.inspect(label + '-native', doc);
  await flow.runOracle({ solids, height: doc.nodes[index].height, workerVolume: bodies[0].volume }, label);
  await flow.page.getByRole('button', { name: 'Iso', exact: true }).click();
  await flow.page.getByTitle('Frame all (F)', { exact: true }).click();
  await flow.snapshot(label + '-isometric');
  return solids[0];
}

async function verifyReview(label, height, faceNames) {
  const dir = dirname(resolve(input));
  const image = await readFile(join(dir, label + '.png'));
  const metadata = JSON.parse(await readFile(join(dir, label + '.json'), 'utf8'));
  assert.equal(metadata.imageSha256, sha256(image));
  const cells = await flow.page.evaluate(async data => {
    const picture = new Image();
    picture.src = 'data:image/png;base64,' + data;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(picture, 0, 0);
    return ['front', 'top', 'right', 'iso'].map((name, index) => {
      const cell = ctx.getImageData((index % 2) * 500 + 8, Math.floor(index / 2) * 500 + 8, 484, 484);
      const { data: rgba } = cell;
      let left = cell.width, right = 0, top = cell.height, bottom = 0, glyphPixels = 0;
      for (let y = 0; y < cell.height; y++) {
        for (let x = 0; x < cell.width; x++) {
          const at = (y * cell.width + x) * 4;
          if (rgba[at] < 250) {
            left = Math.min(x, left); right = Math.max(x, right);
            top = Math.min(y, top); bottom = Math.max(y, bottom);
          }
          if (rgba[at] === 20 && rgba[at + 1] === 20 && rgba[at + 2] === 20) glyphPixels++;
        }
      }
      return { name, width: right - left + 1, height: bottom - top + 1, glyphPixels };
    });
  }, image.toString('base64'));
  const extents = { front: [40, height], top: [40, 20], right: [20, height] };
  const shownNames = new Set();
  for (const cell of cells) {
    const { visible_faces: visible, mm_per_px: scale } = metadata.views[cell.name];
    assert.equal(visible.length, cell.name === 'iso' ? 3 : 1);
    assert.ok(cell.glyphPixels >= 20 * visible.length, `${cell.name} contains its face labels`);
    assert.ok(cell.width > 0 && cell.height > 0 && scale > 0);
    if (cell.name in extents) {
      const [horizontal, vertical] = extents[cell.name];
      // The foreground bounds include the antialiased stroke, up to two pixels on each edge.
      const strokeAllowance = 4 * scale;
      assert.ok(Math.abs(cell.width * scale - horizontal) <= strokeAllowance, `${cell.name} projected width`);
      assert.ok(Math.abs(cell.height * scale - vertical) <= strokeAllowance, `${cell.name} projected height`);
    }
    for (const name of visible) {
      assert.ok(faceNames.includes(name), `${cell.name} names a face on the real B-rep`);
      shownNames.add(name);
    }
  }
  assert.deepEqual(Object.values(metadata.legend).sort(), [...shownNames].sort());
  flow.report.observations.push({ label, revision: metadata.revision, pngSha256: sha256(image), cells });
}

await flow.run(async () => {
  flow.report.observations.push({ inputSha256: sha256(bytes) });
  await flow.freshOpen(resolve(input), source, '01-mcp-open');
  const opened = await verify('02-opened', source);
  flow.phase = 'Decode the two MCP reviews against the native part and independent view extents';
  await verifyReview('review-A', 8, opened.faceNames);
  await verifyReview('review-B', 12, opened.faceNames);
  await flow.same(source);
  await flow.openFeatureEditor(index, 'Extrude');
  const distance = flow.editor().getByLabel('Distance', { exact: true });
  assert.equal(Number(await distance.inputValue()), 12);
  await distance.fill('16');
  await flow.snapshot('03-editing-height');
  const applied = await flow.applyEditor(source, '04-applied');
  assert.deepEqual(applied.doc, edited);
  await verify('05-edited', edited);
  const saved = await flow.save('height-16');
  assert.deepEqual(saved.doc, edited);
  await flow.freshOpen(saved.file, edited, '06-fresh-open');
  await verify('07-reopened', edited);
  assert.deepEqual(await readFile(resolve(input)), bytes);
});
