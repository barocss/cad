import { faceGeometry, type Brep, type BrepFace } from '@barocss/cad';
import { featureId } from './ids';
import type { StudioDoc } from './doc';

type FaceRole = 'x-min' | 'x-max' | 'y-min' | 'y-max' | 'bottom' | 'top' | 'bore'
  | 'first-end' | 'first-seat' | 'shoulder' | 'second-seat' | 'second-end';
type Shape = { key: string; brep: Brep };

export interface StepFaceAssociation {
  role: FaceRole;
  feature: { id: string; kind: 'extrude' | 'hole' | 'shaft' };
  trimmedBy?: string;
  sourceFaces: readonly string[];
  copyFaces: readonly string[];
}

export interface EditableStepEvidence {
  originalHistory: 'unknown';
  sourceBody: string;
  copyBody: string;
  regions: readonly StepFaceAssociation[];
}

type RoleReader = (face: BrepFace) => FaceRole | undefined;

function plateRole(face: BrepFace): FaceRole | undefined {
  const geometry = faceGeometry(face);
  if (geometry.kind === 'cylinder' && geometry.out === -1) return 'bore';
  if (geometry.kind !== 'plane') return;
  const [x, y, z] = geometry.n;
  if (Math.abs(x) === 1) return x < 0 ? 'x-min' : 'x-max';
  if (Math.abs(y) === 1) return y < 0 ? 'y-min' : 'y-max';
  if (Math.abs(z) === 1) return z < 0 ? 'bottom' : 'top';
}

function shaftRoles(shoulder: number, end: number): RoleReader {
  return face => {
    const geometry = faceGeometry(face);
    if (geometry.kind === 'plane' && Math.abs(geometry.n[2]) === 1)
      return geometry.o[2] === 0 ? 'first-end' : geometry.o[2] === shoulder ? 'shoulder' : geometry.o[2] === end ? 'second-end' : undefined;
    if (geometry.kind !== 'cylinder' || geometry.out !== 1 || face.surface.kind !== 'surface') return;
    const heights = face.surface.controlPoints.flatMap(row => row.map(point => point[2]));
    const low = Math.min(...heights), high = Math.max(...heights);
    if (low === 0 && high === shoulder) return 'first-seat';
    if (low === shoulder && high === end) return 'second-seat';
  };
}

function identifiedFaces(brep: Brep, classify: RoleReader): Map<FaceRole, string[]> | undefined {
  const groups = new Map<FaceRole, string[]>();
  for (const face of brep.faces) {
    const role = classify(face);
    if (!role) return;
    const group = groups.get(role);
    if (group) group.push(face.id);
    else groups.set(role, [face.id]);
  }
  return groups;
}

/** Group the real face IDs, after complete source and candidate geometry certification. */
export function editableStepEvidence(source: Shape, copy: Shape, doc: StudioDoc): EditableStepEvidence | undefined {
  let classify: RoleReader, roles: readonly FaceRole[];
  const first = doc.nodes[0], shaft = first?.kind === 'shaft';
  if (shaft) {
    const [a, b] = first.steps;
    if (typeof a.length !== 'number' || typeof b.length !== 'number') return;
    classify = shaftRoles(a.length, a.length + b.length);
    roles = ['first-end', 'first-seat', 'shoulder', 'second-seat', 'second-end'];
  } else {
    classify = plateRole;
    roles = ['x-min', 'x-max', 'y-min', 'y-max', 'bottom', 'top', 'bore'];
  }
  const from = identifiedFaces(source.brep, classify), to = identifiedFaces(copy.brep, classify);
  if (from?.size !== roles.length || to?.size !== roles.length) return;
  const regions: StepFaceAssociation[] = [];
  for (const role of roles) {
    const sourceFaces = from.get(role), copyFaces = to.get(role), count = shaft || role === 'bore' ? 2 : 1;
    if (sourceFaces?.length !== count || copyFaces?.length !== count) return;
    const feature: StepFaceAssociation['feature'] = shaft ? { id: featureId(doc.nodes, 0), kind: 'shaft' }
      : role === 'bore' ? { id: featureId(doc.nodes, 2), kind: 'hole' } : { id: featureId(doc.nodes, 1), kind: 'extrude' };
    const cap = role === 'top' || role === 'bottom';
    regions.push({ role, feature, sourceFaces, copyFaces, ...(cap ? { trimmedBy: featureId(doc.nodes, 2) } : {}) });
  }
  return { originalHistory: 'unknown', sourceBody: source.key, copyBody: copy.key, regions };
}
