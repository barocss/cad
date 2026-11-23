import assert from 'node:assert/strict';
import { frustumStep, holedBoxStep } from './step-fixtures.mjs';

function append(text, records) {
  const end = 'ENDSEC;\nEND-ISO-10303-21;';
  text = text.trimEnd();
  assert.ok(text.endsWith(end));
  return text.slice(0, -end.length) + records.join('\n') + '\n' + end;
}
function nextID(text) {
  return Math.max(...[...text.matchAll(/^#(\d+)=/gm)].map(match => Number(match[1]))) + 1;
}
function angleRecords(first) {
  const radian = first, measure = first + 1, degree = first + 2, dimensions = first + 3;
  return { radian, degree, records: [
    `#${radian}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`,
    `#${dimensions}=DIMENSIONAL_EXPONENTS(0.,0.,0.,0.,0.,0.,0.);`,
    `#${measure}=(MEASURE_WITH_UNIT(PLANE_ANGLE_MEASURE(${Math.PI / 180}),#${radian})PLANE_ANGLE_MEASURE_WITH_UNIT());`,
    `#${degree}=(CONVERSION_BASED_UNIT('DEGREE',#${measure})NAMED_UNIT(#${dimensions})PLANE_ANGLE_UNIT());`,
  ] };
}
function withAngles(text, kind) {
  if (kind === 'unitless') return text;
  const original = text.match(/GLOBAL_UNIT_ASSIGNED_CONTEXT\(\((#\d+)\)\)/);
  assert.ok(original);
  const { radian, degree, records } = angleRecords(nextID(text));
  const length = original[1];
  const otherContext = `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},#${degree}))REPRESENTATION_CONTEXT('other',''))`;
  if (kind === 'inactive') return append(text, [...records, `#${degree + 2}=${otherContext};`]);
  const units = {
    radian: [radian], degree: [degree], conflict: [radian, degree], duplicate: [radian, radian],
    missing: [987654], prefixed: [radian], 'second-owner': [radian],
  }[kind];
  assert.ok(units);
  if (kind === 'prefixed') records[0] = records[0].replace('SI_UNIT($,.RADIAN.)', 'SI_UNIT(.MILLI.,.RADIAN.)');
  if (kind === 'second-owner') {
    const solid = text.match(/^#(\d+)=MANIFOLD_SOLID_BREP/m)?.[1];
    assert.ok(solid);
    const context = degree + 2;
    records.push(`#${context}=${otherContext};`, `#${context + 1}=SHAPE_REPRESENTATION('',(#${solid}),#${context});`);
  }
  return append(text.replace(original[0], `GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${units.map(number => '#' + number).join(',')}))`), records);
}
export function coneAngleFixture(kind, angle = 1, wrapped = false, distance = '0.') {
  let text = frustumStep(10, 6, angle);
  const wall = text.match(/^#(\d+)=(CONICAL_SURFACE\('',#\d+,[^,]+,)([^)]+)\);$/m);
  assert.ok(wall);
  if (kind === 'degree') text = text.replace(wall[0], `#${wall[1]}=${wall[2]}${angle}.);`);
  const tagged = text.match(/^#(\d+)=(CONICAL_SURFACE\([^;]+\));$/m);
  assert.ok(tagged);
  if (wrapped) {
    const n = nextID(text);
    text = append(text.replace(tagged[0], `#${tagged[1]}=OFFSET_SURFACE('',#${n},${distance},.F.);`), [`#${n}=${tagged[2]};`]);
  }
  return withAngles(text, kind);
}
export function nonConeAngleFixture(kind = 'degree') {
  return withAngles(holedBoxStep(), kind);
}
