import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const nativeNames = process.argv.includes('--native-names');
const faceName = '면 😀', edgeName = '모서리 Ø';
const pins = [
  'apps/cad-studio/test/step-unicode-product-name-browser.mjs',
  'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/files/importedFile.ts',
  'packages/barocss-cad/src/io/step.ts',
  'packages/barocss-cad/src/io/step-import.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
];
const f = await createFlow({
  name: 'step-unicode-product-name', output: process.argv[2], envFrozen: 'STEP_UNICODE_PRODUCT_NAME_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Read the actual prepared STEP name bytes and reopen the same output in desktop Studio.',
  inspectorSource: `
import { evaluateCadPart, exportStep } from '@barocss/cad';
import { readFileSync } from 'node:fs';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
if (process.argv[3] === '"names"') {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')) as StudioDoc;
  const [{ brep }] = partBreps(doc);
  console.log(JSON.stringify({ faces: brep.faces.map(face => face.name), edges: brep.edges.map(edge => edge.name) }));
} else {
const part = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [4, 3] },
  { id: 'e', kind: 'extrude', sketch: 's', height: 2 },
] });
let step = exportStep(part.outputs[0].brep, { name: 'seed', timestamp: '2026-11-01T00:00:00Z' });
if (${nativeNames}) step = step.replace("'2;1'", "'4;1'")
  .replace(/ADVANCED_FACE\\('[^']*',/, "ADVANCED_FACE('${faceName}',")
  .replace(/EDGE_CURVE\\('[^']*',/, "EDGE_CURVE('${edgeName}',");
console.log(JSON.stringify(withNode(emptyDoc(), { kind: 'import', name: 'seed.step', step })));
}
`,
  oracleSource: String.raw`
import json, re, sys
from pathlib import Path

case = json.load(sys.stdin)
text = Path(case['file']).read_bytes().decode('ascii')
quoted = r"'(?:[^']|'')*'"
header = re.search(r'^FILE_NAME\((' + quoted + ')', text, re.M)
product = re.search(r'^#\d+=PRODUCT\((' + quoted + '),(' + quoted + ')', text, re.M)
assert header and product

def decode(token):
    raw = token[1:-1].replace("''", "'")
    directive = re.compile(r'\\\\|\\X4\\([0-9A-F]+)\\X0\\')
    def replace(match):
        digits = match.group(1)
        if digits is None:
            return chr(92)
        assert len(digits) % 8 == 0
        return ''.join(chr(int(digits[i:i+8], 16)) for i in range(0, len(digits), 8))
    return directive.sub(replace, raw)

assert decode(header[1]) == case['expected'] + '.step'
assert [decode(product[i]) for i in (1,2)] == [case['expected']] * 2
assert (chr(92) + 'X4' + chr(92) in header[1]) == case['encoded']
print(json.dumps({'status':'PASS', 'header':decode(header[1]), 'products':[decode(product[1]), decode(product[2])]}))
if case.get('native'):
    for kind, name in case['native'].items():
        records = re.findall(r'^#\d+=' + kind + r'\((' + quoted + ')', text, re.M)
        assert name in list(map(decode, records)), (kind, records)
`,
});

const panel = () => f.page.getByRole('region', { name: 'STEP export', exact: true });
const near24 = value => assert.ok(Math.abs(value - 24) < 1e-8, String(value));
const standardName = '부품 😀';

await f.run(async () => {
  const create = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await create(options);
    await context.addInitScript(() => {
      const StudioWorker = window.Worker;
      window.__stepReplies = [];
      window.Worker = class extends StudioWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            if (typeof event.data?.step?.text === 'string') window.__stepReplies.push(event.data.step);
          });
        }
      };
    });
    return context;
  };
  const seed = await f.inspect('native-seed', {});
  if (nativeNames) {
    const names = await f.inspect('native-before', seed, 'names');
    assert.ok(names.faces.includes('n0.' + faceName));
    assert.ok(names.edges.includes('n0.' + edgeName));
  }
  const cases = nativeNames ? [['plate A_1', 'native-names']] : [[standardName, 'unicode'], ['plate A_1', 'ascii']];
  for (const [name, title] of cases) {
    f.phase = `Prepare the real STEP with a ${title} product name`;
    await f.newPage();
    await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
      name: name + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
    });
    await f.same(seed);
    near24((await f.bodies()).bodies[0].volume);
    assert.equal(await f.page.getByLabel('File name', { exact: true }).inputValue(), name);
    await f.page.getByRole('button', { name: 'Export STEP', exact: true }).click();
    await panel().getByText(name + '.step', { exact: true }).waitFor();
    await f.page.waitForFunction(() => window.__stepReplies.length > 0
      && document.querySelector('[aria-label="STEP export"] button.primary')?.disabled === false);
    const reply = await f.page.evaluate(() => window.__stepReplies.at(-1));
    const replaced = baseline && title === 'unicode';
    const lostNative = nativeNames && baseline;
    if (replaced) assert.match(reply.omitted.join(' '), /Non-ASCII.*replaced with underscores/);
    else if (lostNative) assert.match(reply.omitted.join(' '), /Non-ASCII.*native face and edge names are not retained/);
    else assert.deepEqual(reply.omitted ?? [], []);
    await f.same(seed);
    await f.snapshot(title + '-prepared');
    const file = join(f.output, title + '.step');
    await writeFile(file, reply.text);
    const native = nativeNames ? {
      ADVANCED_FACE: 'n0.' + (lostNative ? '_ __' : faceName),
      EDGE_CURVE: 'n0.' + (lostNative ? '___ _' : edgeName),
    } : undefined;
    await f.runOracle({ file, expected: replaced ? '__ __' : name, encoded: !replaced && title === 'unicode', native }, title);
    await panel().getByRole('button', { name: 'Cancel', exact: true }).click();
    await f.same(seed);
    f.phase = `Open the prepared ${title} STEP in a fresh context`;
    await f.newPage();
    await f.openFile(file, 1);
    await f.page.waitForFunction(() => window.__studioDoc?.nodes[0]?.kind === 'import');
    near24((await f.bodies()).bodies[0].volume);
    if (!baseline && nativeNames) await f.page.getByText(/Product and body labels, colours and assembly structure are omitted/).waitFor();
    if (native) {
      const names = await f.inspect('native-after', await f.doc(), 'names');
      assert.ok(names.faces.includes('n0.' + native.ADVANCED_FACE), JSON.stringify(names.faces));
      assert.ok(names.edges.includes('n0.' + native.EDGE_CURVE), JSON.stringify(names.edges));
    }
    await f.snapshot(title + '-step-reopened');
    f.report.observations.push({ name, preparedHash: sha256(reply.text), volume: 24, losses: reply.omitted ?? [] });
  }
  assert.deepEqual(f.report.downloads, []);
});
