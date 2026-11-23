import assert from 'node:assert/strict';
import test from 'node:test';
import { BrepError, brepMassProperties, checkBrep, evaluateCadPart, importStep } from '../dist/index.js';
import { coneAngleFixture, nonConeAngleFixture } from './step-cone-angle-fixtures.mjs';

const unsupportedAngle = /CONICAL_SURFACE plane-angle unit.*(?:not supported|ambiguous)/;
const refusal = error => error instanceof BrepError && error.code === 'INPUT' && unsupportedAngle.test(error.message);

for (const angle of [1, 30]) for (const wrapped of [false, true]) {
  test(`STEP cone ${angle}° ${wrapped ? 'zero-offset' : 'direct'}: radian geometry is unchanged and degrees refuse`, () => {
    const make = kind => coneAngleFixture(kind, angle, wrapped);
    const legacy = importStep(make('unitless')), radian = importStep(make('radian'));
    assert.deepEqual(radian, legacy);
    assert.equal(checkBrep(radian, { strict: true }).valid, true);
    const top = 10 - 6 * Math.tan(angle * Math.PI / 180);
    const expected = 2 * Math.PI * (100 + 10 * top + top * top);
    assert.ok(Math.abs(brepMassProperties(radian, 1).volume - expected) < 1e-7);
    assert.throws(() => importStep(make('degree')), refusal);
    const doc = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
      features: [{ id: 'n0', kind: 'import', step: make('degree') }] };
    const before = structuredClone(doc);
    assert.throws(() => evaluateCadPart(doc), error => error.code === 'CAPABILITY' && unsupportedAngle.test(error.message));
    assert.deepEqual(doc, before);
  });
}

test('cone unit admission follows the owner, not unrelated declarations or quoted text', () => {
  const legacy = importStep(coneAngleFixture('unitless'));
  const file = coneAngleFixture('inactive').replace('/* written as OCCT writes it */', '/* non-active DEGREE #55 */')
    .replace("FILE_NAME('f.stp'", "FILE_NAME('DEGREE input control'");
  assert.deepEqual(importStep(file), legacy);
  const noOwner = coneAngleFixture('unitless').replace(/^#\d+=ADVANCED_BREP_SHAPE_REPRESENTATION[^\n]+\n/m, '');
  assert.deepEqual(importStep(noOwner), legacy);
  assert.deepEqual(importStep(nonConeAngleFixture()), importStep(nonConeAngleFixture('unitless')));
});

test('two solids in different contexts do not borrow angle units', () => {
  const radian = coneAngleFixture('radian');
  const other = nonConeAngleFixture().split('DATA;\n')[1].split('\nENDSEC;')[0]
    .replace(/#(\d+)/g, (_record, number) => '#' + (1000 + Number(number)));
  const combined = radian.replace('ENDSEC;\nEND-ISO-10303-21;', other + '\nENDSEC;\nEND-ISO-10303-21;');
  const accepted = importStep(combined);
  assert.equal(accepted.bodies.length, 2);
  assert.equal(checkBrep(accepted, { strict: true }).valid, true);
});

test('a complex representation supplies its inherited items and angle context', () => {
  const complex = unit => coneAngleFixture(unit).replace(
    /ADVANCED_BREP_SHAPE_REPRESENTATION(\('',\(#\d+\),#\d+\));/,
    '(ADVANCED_BREP_SHAPE_REPRESENTATION()REPRESENTATION$1SHAPE_REPRESENTATION());',
  );
  assert.match(complex('radian'), /ADVANCED_BREP_SHAPE_REPRESENTATION\(\)REPRESENTATION\(/);
  assert.deepEqual(importStep(complex('radian')), importStep(coneAngleFixture('radian')));
  assert.throws(() => importStep(complex('degree')), refusal);
});

test('attached context references must resolve unambiguously for an angle-consuming surface', () => {
  for (const kind of ['conflict', 'duplicate', 'missing', 'prefixed', 'second-owner']) {
    for (const wrapped of [false, true]) assert.throws(() => importStep(coneAngleFixture(kind, 1, wrapped)), refusal, kind);
  }
  const invalid = coneAngleFixture('radian').replace(/(ADVANCED_BREP_SHAPE_REPRESENTATION[^\n]+,)#\d+\);/, '$1#987654);');
  assert.throws(() => importStep(invalid), refusal);
  assert.throws(() => importStep(coneAngleFixture('degree', 1, true, '1E-9999')), /basis CONICAL_SURFACE is not supported yet/);
});
