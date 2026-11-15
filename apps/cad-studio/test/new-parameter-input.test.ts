import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { addParameters } from '@barocss/cad-model/engine/parameters';
import { newParameterInput } from '../src/ui/newParameterInput';
import { ParametersPanel } from '../src/ui/ParametersPanel';

test('blank/nonfinite new values refuse without modifying prior document; explicit zero and precision survive', () => {
  const doc = emptyDoc(), before = JSON.stringify(doc);
  for (const value of ['', ' ', '\t', 'NaN', 'Infinity', '-Infinity']) {
    const result = newParameterInput('BlankValue', value, doc.parameters);
    assert.ok(!result.ok); assert.equal(result.field, 'value'); assert.match(result.message, /Enter a number/);
  }
  for (const text of ['0', '-0', '44.721359549995796', '1.2345678901234567e-8', '-5']) {
    const input = newParameterInput('_Gap', text, doc.parameters); assert.ok(input.ok);
    assert.ok(Object.is(input.value, Number(text)));
    const next = addParameters(doc, { [input.name]: input.value });
    assert.equal(next.parameters._Gap, Number(text)); assert.deepEqual(next.nodes, doc.nodes);
  }
  assert.equal(JSON.stringify(doc), before);
});
test('name guidance matches actual underscore and length admission, preserving duplicates', () => {
  for (const name of ['3Gap', '', 'a'.repeat(33), 'a-b']) {
    const result = newParameterInput(name, '0', {}); assert.ok(!result.ok);
    assert.equal(result.field, 'name'); assert.match(result.message, /letter or underscore/);
  }
  assert.deepEqual(newParameterInput(' _Gap ', '0', {}), { ok: true, name: '_Gap', value: 0 });
  assert.equal(newParameterInput('a'.repeat(32), '0', {}).ok, true);
  const duplicate = newParameterInput('Width', '2', { Width: 1 }); assert.ok(!duplicate.ok); assert.match(duplicate.message, /already/);
});
test('empty panel asks for name and number and retains binding guidance in a closed disclosure', () => {
  const html = renderToString(createElement(ParametersPanel, { doc: emptyDoc(), onChange() {}, onError() {}, onClose() {} }));
  assert.match(html, /Enter a parameter name and a number/);
  assert.match(html, /<summary>Use parameters in features<\/summary>/);
  assert.match(html, /editor \(ƒ\)/); assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /aria-label="New parameter value"/);
});
