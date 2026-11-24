import assert from 'node:assert/strict';
import test from 'node:test';
import { BrepError, brepMassProperties, checkBrep, evaluateCadPart, importStep, stepMeshes } from '../dist/index.js';
import { coneAngleFixture, nonConeAngleFixture, tetrahedronAngleFixture } from './step-cone-angle-fixtures.mjs';

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

for (const tessellated of [false, true]) test(`active DEGREE leaves a pure ${tessellated ? 'tessellated' : 'planar'} solid unchanged`, () => {
  for (const cm of [false, true]) {
    const step = tetrahedronAngleFixture('degree', { tessellated, cm });
    const legacy = tetrahedronAngleFixture('unitless', { tessellated, cm });
    // Read the explicit fixture graph independently of STEP import. The solid owns this representation.
    const solid = step.match(tessellated ? /^(#\d+)=TESSELLATED_SOLID\(/m : /^(#\d+)=MANIFOLD_SOLID_BREP\(/m)?.[1];
    const owner = step.match(tessellated ? /^#\d+=TESSELLATED_SHAPE_REPRESENTATION\('',\((#\d+)\),(#\d+)\);/m
      : /^#\d+=ADVANCED_BREP_SHAPE_REPRESENTATION\('',\((#\d+)\),(#\d+)\);/m);
    assert.ok(solid && owner);
    assert.equal(owner[1], solid);
    const record = ref => step.split('\n').find(line => line.startsWith(`${ref}=`)) ?? '';
    const assignment = record(owner[2]).match(/GLOBAL_UNIT_ASSIGNED_CONTEXT\(\((#\d+),(#\d+)\)\)/);
    assert.ok(assignment);
    assert.ok(record(assignment[1]).includes(`SI_UNIT(${cm ? '.CENTI.' : '.MILLI.'},.METRE.)`));
    const conversion = record(assignment[2]).match(/CONVERSION_BASED_UNIT\('DEGREE',(#\d+)\)/);
    assert.ok(conversion);
    const factor = record(conversion[1]).match(/PLANE_ANGLE_MEASURE\(([^)]+)\),(#\d+)/);
    assert.ok(factor);
    assert.equal(Number(factor[1]), Math.PI / 180);
    assert.match(record(factor[2]), /SI_UNIT\(\$,\.RADIAN\.\)/);
    assert.doesNotMatch(step, /CONICAL_SURFACE|CYLINDRICAL_SURFACE|OFFSET_SURFACE/);
    assert.deepEqual(stepMeshes(step), stepMeshes(legacy));
    const brep = importStep(step);
    assert.deepEqual(brep, importStep(legacy));
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.deepEqual(brep.faces.map(face => face.name).sort(), ['bottom', 'front', 'left', 'slope']);
    const scale = cm ? 10 : 1, { volume, centroid } = brepMassProperties(brep, 1);
    assert.ok(Math.abs(volume * scale ** 3 - 32) < 1e-8);
    assert.ok(centroid.every((axis, index) => Math.abs(axis * scale - [1, 1.5, 2][index]) < 1e-8));
  }
});
