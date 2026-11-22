import { faceGeometry } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { bodyNodeOf, featureId } from '../engine/ids';
import { bodyKeyOf, partSnapshot } from '../engine/part';
import type { Query } from '../engine/schema/spec';

/** The current output of Exact cylinder Thicken owns both corresponding, untrimmed skins. */
export function radialWallOf(doc: StudioDoc, bodies: readonly BodyResult[], { a, b }: Extract<Query, { fn: 'radial_wall' }>) {
  const unknown = { unknown: 'Radial wall thickness needs the distinct native inner and outer faces of one current Exact cylinder Thicken solid.' };
  if (!bodies.length || typeof a !== 'string' || typeof b !== 'string' || a === b) return unknown;
  const keys = new Set(bodies.map(body => body.key));
  const faces = partSnapshot(doc).outputs.filter(output => keys.has(bodyKeyOf(output.id, doc.nodes))).flatMap(output =>
    output.brep.faces.map(face => ({ output, face })));
  const first = faces.filter(({ face }) => face.name === a);
  const second = faces.filter(({ face }) => face.name === b);
  if (first.length !== 1 || second.length !== 1 || first[0].output !== second[0].output) return unknown;
  const { id, feature, brep } = first[0].output;
  const owner = bodyNodeOf(doc.nodes, bodyKeyOf(id, doc.nodes));
  const node = owner && doc.nodes[owner.node];
  if (owner?.side !== 'solid' || node?.kind !== 'thicken' || node.mode !== 'exact-cylinder' || node.suppressed ||
      id !== feature || featureId(doc.nodes, owner.node) !== feature ||
      brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed ||
      brep.faces.length !== 6 || first[0].face.shell !== brep.shells[0].id || second[0].face.shell !== brep.shells[0].id) return unknown;
  const firstGeometry = faceGeometry(first[0].face), secondGeometry = faceGeometry(second[0].face);
  if (firstGeometry.kind !== 'cylinder' || secondGeometry.kind !== 'cylinder' || firstGeometry.out === secondGeometry.out) return unknown;
  const outerFirst = firstGeometry.out === 1;
  const [outer, inner] = outerFirst ? [firstGeometry, secondGeometry] : [secondGeometry, firstGeometry];
  const x = outer.r - inner.r;
  return Number.isFinite(x) && x > 0 && inner.r > 0
    ? { x, entities: outerFirst ? [a, b] : [b, a], hint: 'the native coaxial wall thickness' }
    : unknown;
}
