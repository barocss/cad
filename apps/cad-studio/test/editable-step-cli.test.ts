import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { emptyDoc, rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { exportStudioStep } from '@barocss/cad-model/engine/evaluate';
import { sha256Hex } from '@barocss/cad-model/util/digest';
import { editableStepMain } from '../server/editableStepCli';

const plate = withNode(rectanglePart(40, 30, 10), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3 });
const shaft = withNode(emptyDoc(), { kind: 'shaft', center: [0, 0], generator: 'shaft@0',
  steps: [{ diameter: 20, length: 12 }, { diameter: 12, length: 8 }] });

function run(...args: string[]) {
  const stdout = new PassThrough(), stderr = new PassThrough();
  let out = '', err = '';
  stdout.on('data', chunk => { out += chunk; }); stderr.on('data', chunk => { err += chunk; });
  const status = editableStepMain(args, { stdout, stderr });
  return { status, out: out ? JSON.parse(out) : null, err: err ? JSON.parse(err) : null };
}
const stepOf = (doc: typeof plate) => exportStudioStep(doc, { name: 'Original', timestamp: '2026-11-24T00:00:00' }).text;

test('reviews exact plate and shaft graphs, then writes only the explicitly reviewed bytes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'editable-step-cli-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const fixtures = [['plate', plate, ['--named']], ['shaft', shaft, []]] as const;
  for (const [family, doc, options] of fixtures) {
    const original = stepOf(doc), source = join(dir, family + '.step'), output = join(dir, family + '.bcad');
    writeFileSync(source, original);
    const files = readdirSync(dir), reviewed = run(source, ...options);
    assert.equal(reviewed.status, 0);
    assert.deepEqual(readdirSync(dir), files);
    assert.equal(reviewed.out.source.name, family + '.step');
    assert.equal(reviewed.out.source.sha256, sha256Hex(Buffer.from(original)));
    assert.equal(reviewed.out.candidate.family, family);
    assert.equal(reviewed.out.candidate.history, 'new');
    assert.equal(reviewed.out.candidate.nodes[0].id, 'n0');
    assert.match(reviewed.out.review, /^[0-9a-f]{64}$/);
    assert.equal(reviewed.out.written, undefined);
    const copied = run(source, ...options, '-o', output, '--review', reviewed.out.review);
    assert.equal(copied.status, 0, JSON.stringify(copied.err));
    assert.equal(copied.out.written, family + '.bcad');
    const bytes = readFileSync(output);
    assert.deepEqual(JSON.parse(bytes.toString()).nodes, reviewed.out.candidate.nodes);
    assert.equal(sha256Hex(bytes), reviewed.out.candidate.sha256);
    assert.equal(readFileSync(source, 'utf8'), original);

    writeFileSync(output, 'Existing file');
    const repeated = run(source, ...options, '-o', output, '--review', reviewed.out.review);
    assert.equal(repeated.status, 1);
    assert.equal(repeated.err.code, 'FILE_EXISTS');
    assert.equal(readFileSync(output, 'utf8'), 'Existing file');
    assert.ok(readdirSync(dir).every(file => !file.endsWith('.tmp')));
  }
});

test('refuses a different parameter graph or source bytes and preserves an absent output', t => {
  const dir = mkdtempSync(join(tmpdir(), 'editable-step-stale-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const input = join(dir, 'initial.stp'), output = join(dir, 'candidate.bcad'), source = stepOf(plate);
  writeFileSync(input, source);
  const reviewed = run(input);
  const mismatch = run(input, '--named', '-o', output, '--review', reviewed.out.review);
  assert.equal(mismatch.err.code, 'STALE_REVIEW');
  writeFileSync(input, source.replace("PRODUCT('Original'", "PRODUCT('Renamed'"));
  const changed = run(input);
  assert.equal(changed.out.candidate.sha256, reviewed.out.candidate.sha256);
  assert.notEqual(changed.out.review, reviewed.out.review);
  assert.equal(run(input, '-o', output, '--review', reviewed.out.review).err.code, 'STALE_REVIEW');
  assert.deepEqual(readdirSync(dir), ['initial.stp']);
});

test('rejects unsupported input, names and missing review with stable receipts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'editable-step-refusal-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const input = join(dir, 'source.step');
  writeFileSync(input, stepOf(rectanglePart(40, 30, 10)));
  assert.equal(run(input).err.code, 'UNSUPPORTED_STEP');
  assert.equal(run(input, '-o', join(dir, 'bare.bcad')).status, 2);
  assert.equal(run(input, '--named', '--named').status, 2);
  assert.equal(run('https://example.com/source.step').status, 2);
  writeFileSync(input, stepOf(shaft));
  assert.equal(run(input, '--named').err.code, 'UNSUPPORTED_DRIVERS');
  writeFileSync(input, Buffer.alloc(96 * 1024 + 1));
  assert.equal(run(input).err.code, 'STEP_READ');
  assert.deepEqual(readdirSync(dir), ['source.step']);
});
