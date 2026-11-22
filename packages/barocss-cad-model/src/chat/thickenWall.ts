import { faceGeometry } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { bodyNodeOf, featureId } from '../engine/ids';
import { bodyKeyOf, partSnapshot } from '../engine/part';
import { isAxialThickenCut, isClosedSixFaceSolid } from '../engine/axialThickenCut';
import { isUpperThickenCapOffset } from '../engine/upperThickenCapOffset';
import { dot, sub } from '../engine/vec3';
import type { Query } from '../engine/schema/spec';

type WallQuery = Extract<Query, { fn: 'radial_wall' | 'planar_wall' }>;
export const isThickenWallQuery = (fn: unknown): fn is WallQuery['fn'] => fn === 'radial_wall' || fn === 'planar_wall';

/** Measure the two native skins of a current Exact Thicken or a qualified change to one of its axial ends. */
export function thickenWallOf(doc: StudioDoc, bodies: readonly BodyResult[], { fn, a, b }: WallQuery) {
  const radial = fn === 'radial_wall';
  const unknown = { unknown: radial
    ? 'Radial wall thickness needs the distinct native inner and outer faces of one current Exact cylinder Thicken solid, its full axial-end cut, or its original upper-cap Offset.'
    : 'Planar wall thickness needs the distinct normal and reverse skin faces of one current Exact planar Thicken solid.' };
  if (!bodies.length || typeof a !== 'string' || typeof b !== 'string' || a === b) return unknown;
  const keys = new Set(bodies.map(body => body.key));
  const snapshot = partSnapshot(doc);
  const faces = snapshot.outputs.filter(output => keys.has(bodyKeyOf(output.id, doc.nodes))).flatMap(output =>
    output.brep.faces.map(face => ({ output, face })));
  const first = faces.filter(({ face }) => face.name === a);
  const second = faces.filter(({ face }) => face.name === b);
  if (first.length !== 1 || second.length !== 1 || first[0].output !== second[0].output) return unknown;
  const { id, feature, brep } = first[0].output;
  const owner = bodyNodeOf(doc.nodes, bodyKeyOf(id, doc.nodes));
  const node = owner && doc.nodes[owner.node];
  if (owner?.side !== 'solid' || !node || node.suppressed || id !== feature || featureId(doc.nodes, owner.node) !== feature ||
      !isClosedSixFaceSolid(brep)) return unknown;
  const direct = node.kind === 'thicken' && node.mode === (radial ? 'exact-cylinder' : 'exact-planar');
  if (!direct && (!radial || (node.kind !== 'difference' && node.kind !== 'offset-face'))) return unknown;
  const firstGeometry = faceGeometry(first[0].face), secondGeometry = faceGeometry(second[0].face);
  if (!radial) {
    const normalName = `${feature}.normal`, reverseName = `${feature}.reverse`;
    const normalFirst = a === normalName && b === reverseName;
    const reverseFirst = a === reverseName && b === normalName;
    if ((!normalFirst && !reverseFirst) ||
        firstGeometry.kind !== 'plane' || secondGeometry.kind !== 'plane' ||
        Math.abs(1 + dot(firstGeometry.n, secondGeometry.n)) > 64 * Number.EPSILON) return unknown;
    const [normal, reverse] = normalFirst ? [firstGeometry, secondGeometry] : [secondGeometry, firstGeometry];
    const x = dot(sub(normal.o, reverse.o), normal.n);
    return Number.isFinite(x) && x > 0 ? { x, entities: [normalName, reverseName], hint: 'the native normal wall thickness' } : unknown;
  }
  if (firstGeometry.kind !== 'cylinder' || secondGeometry.kind !== 'cylinder' || firstGeometry.out === secondGeometry.out) return unknown;
  if (!direct) {
    const retained = node.kind === 'offset-face'
      ? isUpperThickenCapOffset(doc, snapshot, owner.node, brep, [a, b])
      : isAxialThickenCut(doc, snapshot, owner.node, brep, [a, b], [firstGeometry, secondGeometry]);
    if (!retained) return unknown;
  }
  const outerFirst = firstGeometry.out === 1;
  const [outer, inner] = outerFirst ? [firstGeometry, secondGeometry] : [secondGeometry, firstGeometry];
  const x = outer.r - inner.r;
  return Number.isFinite(x) && x > 0 && inner.r > 0
    ? { x, entities: outerFirst ? [a, b] : [b, a], hint: 'the native coaxial wall thickness' }
    : unknown;
}
