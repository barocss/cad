import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { sheetSvg, sheetsSvg, sheetGroupsSvg, marksSvg } from '../src/io/svg';
import type { Sheet, Mark } from '../src/drawing/sheet';
import { isRefusal } from '../src/engine/refusal';

function sheet(text: string): Sheet {
  return { size: [210, 297], dimensions: [], groups: [{ role: 'note', id: 'note1', marks: [{ kind: 'text', at: [10, 10], size: 3, anchor: 'start', text }] }] };
}
function xml(svg: string) {
  const result = spawnSync('python3', ['-c', `import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.buffer.read())
print(json.dumps({'tags':[e.tag for e in r.iter()], 'text':[e.text for e in r.iter() if e.tag.endswith('text')], 'attrs':[e.attrib for e in r.iter() if e.tag.endswith('g')]}))`], { input: svg, encoding: 'utf8' });
  assert.equal(result.error, undefined, 'Python stdlib XML oracle must be available');
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { tags: string[]; text: string[]; attrs: Record<string, string>[] };
}
const illegal = [...Array.from({ length: 32 }, (_, point) => point).filter(point => ![9, 10, 13].includes(point)), 0xD800, 0xDBFF, 0xDC00, 0xDFFF, 0xFFFE, 0xFFFF];
test('standalone SVG refuses all forbidden C0 controls, lone surrogates and BMP FFFE/FFFF without mutating input', () => {
  for (const point of illegal) {
    const input = sheet(`before${String.fromCharCode(point)}after`), before = structuredClone(input);
    assert.throws(() => sheetSvg(input, 'safe'), error => isRefusal(error, 'VALUE') && error.message.includes(`U+${point.toString(16).toUpperCase().padStart(4, '0')}`));
    assert.deepEqual(input, before);
  }
});
test('standalone export also checks title and escaped attribute values; inline rendering does not throw', () => {
  const input = sheet('safe');
  assert.throws(() => sheetSvg(input, 'title\u0001'), /XML 1.0.*U\+0001/);
  input.groups[0].id = 'id\u000B'; assert.throws(() => sheetSvg(input, 'title'), /U\+000B/);
  const bad = sheet('text\u0001');
  assert.doesNotThrow(() => sheetGroupsSvg(bad)); assert.doesNotThrow(() => marksSvg(bad.groups[0].marks));
  assert.ok(sheetGroupsSvg(bad).includes('\u0001'));
});
test('valid XML whitespace, Korean, engineering symbols and supplementary pairs survive export and an independent parser', () => {
  const text = '한글 Ø ± ⌀ ° & < > " \t\n\r😀𝛼' + String.fromCodePoint(0x10000, 0x10FFFF);
  const input = sheet(text), output = sheetSvg(input, '검토 & <title> 😀');
  assert.ok(output.includes('\t\n\r')); assert.ok(output.includes('한글 Ø ± ⌀ °')); assert.ok(output.includes('😀𝛼'));
  assert.deepEqual(xml(output).text, [text.replace(/\r/g, '\n')]);
});
test('group identity/view/role and text anchor cannot inject XML through quoted attributes', () => {
  const input = sheet('safe & <text>');
  const value = 'name" data-extra="no<&';
  input.groups[0].id = value;
  input.groups[0].view = value as NonNullable<Sheet['groups'][number]['view']>;
  input.groups[0].role = value as Sheet['groups'][number]['role'];
  (input.groups[0].marks[0] as Extract<Mark, { kind: 'text' }>).anchor = value as 'end';
  const parsed = xml(sheetSvg(input, 'safe'));
  const group = parsed.attrs.find(attrs => attrs['data-dim']);
  assert.equal(group?.['data-dim'], value); assert.equal(group?.['data-view'], value); assert.equal(group?.class, value);
  assert.ok(parsed.attrs.every(attrs => !('data-extra' in attrs)));
});
test('multi-sheet serialization returns no partial result when a later sheet is illegal', () => {
  const inputs = [sheet('first'), sheet('bad\u0001')], before = structuredClone(inputs);
  let result: string[] | undefined;
  assert.throws(() => { result = sheetsSvg(inputs, 'set'); }, /U\+0001/);
  assert.equal(result, undefined); assert.deepEqual(inputs, before);
  const valid = sheetsSvg([sheet('첫째'), sheet('둘째')], 'set');
  assert.equal(valid.length, 2); for (const output of valid) xml(output);
});
