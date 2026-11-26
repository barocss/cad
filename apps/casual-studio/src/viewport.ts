import type { CasualSolidScene } from '@barocss/cad-model/app/casualPlate';
const ns = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

export function viewport(svg: SVGSVGElement, scene: CasualSolidScene, selected: string | null, top: boolean, before?: CasualSolidScene) {
  const { positions, indices, faces, edges } = scene.mesh;
  const project = (x: number, y: number, z: number): [number, number, number] => top
    ? [x, -y, z] : [.91 * x + .42 * y, .19 * x - .42 * y - .88 * z, .37 * x - .80 * y + .49 * z];
  const projected = [];
  for (let i = 0; i < positions.length; i += 3) projected.push(project(positions[i], positions[i + 1], positions[i + 2]));
  let left = Infinity, right = -Infinity, bottom = -Infinity, topY = Infinity;
  for (const [x, y] of projected) { left = Math.min(left, x); right = Math.max(right, x); topY = Math.min(topY, y); bottom = Math.max(bottom, y); }
  const scale = Math.min(590 / (right - left), 310 / (bottom - topY));
  const xy = ([x, y]: number[]) => [(x - (left + right) / 2) * scale + 375, (y - (topY + bottom) / 2) * scale + 220];
  const points = (list: number[][]) => list.map(p => xy(p).map(v => v.toFixed(2)).join(',')).join(' ');
  const tris: { depth: number; node: SVGPolygonElement }[] = [];
  for (const face of faces) {
    const owner = scene.wallOwners.get(face.faceId);
    for (let i = face.indexOffset; i < face.indexOffset + face.indexCount; i += 3) {
      const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
      const a = projected[ia], b = projected[ib], c = projected[ic];
      const signedArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (signedArea >= -1e-9) continue; // front-facing triangles, y-down
      const nz = Math.abs(scene.mesh.normals[ia * 3 + 2]);
      const fill = owner ? selected === owner ? '#315da2' : '#526b82' : nz > .95 ? '#cfdeec' : '#849bb1';
      const node = el('polygon', { points: points([a, b, c]), fill, stroke: fill, 'stroke-width': .5 });
      if (owner) { node.dataset.hole = owner; node.classList.add('pickable'); }
      tris.push({ depth: (a[2] + b[2] + c[2]) / 3, node });
    }
  }
  tris.sort((a, b) => a.depth - b.depth);
  const contents: SVGElement[] = tris.map(t => t.node);
  const outline = (edge: CasualSolidScene['mesh']['edges'][number]) => {
    const list = [];
    for (let i = 0; i < edge.points.length; i += 3) list.push(project(edge.points[i], edge.points[i+1], edge.points[i+2]));
    return points(list);
  };
  if (before && selected) for (const edge of before.mesh.edges) if (before.rimOwners.get(edge.edgeId) === selected) {
    contents.push(el('polyline', { points: outline(edge), fill: 'none', stroke: '#eaf1ff', 'stroke-width': 2, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
  }
  for (const edge of edges) {
    const owner = scene.rimOwners.get(edge.edgeId);
    if (!owner) continue;
    const p = outline(edge);
    // Thin drawing plus an invisible, geometry-following stroke as the edge hit tolerance.
    contents.push(el('polyline', { points: p, fill: 'none', stroke: owner === selected ? '#1766e8' : '#627d97', 'stroke-width': 2, 'pointer-events': 'none' }));
    const hit = el('polyline', { points: p, fill: 'none', stroke: 'transparent', 'stroke-width': 10, 'pointer-events': 'stroke', class: 'pickable' });
    hit.dataset.hole = owner; hit.dataset.rim = owner;
    contents.push(hit);
  }
  svg.replaceChildren(...contents);
  const anchors = new Map<string, [number, number]>();
  for (const e of edges) {
    const id = scene.rimOwners.get(e.edgeId);
    if (!id || anchors.has(id)) continue;
    const xyz = e.points;
    const point = xy(project(xyz[0], xyz[1], xyz[2]));
    anchors.set(id, [point[0], point[1]]);
  }
  return anchors;
}
