import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

export type SensorPart = 'body' | 'lid' | 'board' | 'left' | 'right';
export type SensorBody = { mesh: BodyResult['mesh']; part: SensorPart };
export type SensorView = 'exploded' | 'inside' | 'assembled';
const palette: Record<SensorPart, readonly [number, number, number]> = {
  body: [110, 146, 174], lid: [150, 181, 207], board: [81, 158, 136], left: [205, 156, 79], right: [205, 156, 79],
};
const svgNS = 'http://www.w3.org/2000/svg';
type XYZ = [number, number, number];
const lifts = (part: SensorPart, view: SensorView) => view !== 'exploded' ? 0 : part === 'lid' ? 27 : part === 'board' ? 14 : 0;

export function drawSensor(svg: SVGSVGElement, bodies: SensorBody[], view: SensorView, impact: ReadonlySet<SensorPart>, isolated = false) {
  const project = (x: number, y: number, z: number): XYZ => [.87*x + .50*y, .24*x - .42*y - .87*z, .44*x - .75*y + .48*z];
  // Fixed world frame across widths gives the preview an honest overlay: no rescale or recenter on a width edit.
  const [centerX, centerY] = view === 'exploded' ? [41, -21] : [41, -10];
  const scale = view === 'exploded' ? 5.65 : 7;
  const xy = (p: XYZ) => [400 + (p[0] - centerX)*scale, 249 + (p[1] - centerY)*scale].map(v => v.toFixed(2)).join(',');
  const markers: SVGCircleElement[] = [];
  const triangles: { depth: number; node: SVGPolygonElement }[] = [];
  for (const { mesh, part } of bodies) {
    if (part === 'lid' && view === 'inside') continue;
    const { positions, normals, indices } = mesh;
    const offset = lifts(part, view);
    if ((part === 'left' || part === 'right') && impact.has(part)) {
      const {min, max} = mesh.bounds;
      const [cx, cy] = xy(project((min[0]+max[0])/2, (min[1]+max[1])/2, max[2])).split(',');
      const marker = document.createElementNS(svgNS, 'circle');
      marker.setAttribute('cx',cx); marker.setAttribute('cy',cy); marker.setAttribute('r',isolated ? '8' : '5');
      marker.setAttribute('fill','#f0f6ff'); marker.setAttribute('stroke','#255dc3'); marker.setAttribute('stroke-width','2');
      marker.dataset.anchor = part;
      markers.push(marker);
    }
    const pts: XYZ[] = [];
    for (let i=0; i<positions.length; i+=3) pts.push(project(positions[i], positions[i+1], positions[i+2]+offset));
    for (let i=0; i<indices.length; i+=3) {
      const n = indices[i], a = pts[n], b = pts[indices[i+1]], c = pts[indices[i+2]];
      if ((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]) >= -1e-8) continue;
      const lit = Math.max(.63, Math.min(1.0, .80 + normals[n*3+2]*.17 - normals[n*3+1]*.10));
      const blend = isolated ? .54 : .26;
      const rgb = impact.has(part) ? palette[part].map((value,i) => value * (1-blend) + [75,125,224][i] * blend) : palette[part];
      const fill = 'rgb(' + rgb.map(value => Math.round(value * lit)).join(' ') + ')';
      const node = document.createElementNS(svgNS, 'polygon');
      node.setAttribute('points', [a,b,c].map(xy).join(' '));
      node.setAttribute('fill', fill); node.setAttribute('stroke', fill); node.setAttribute('stroke-width', '.65');
      node.dataset.sensorPart = part;
      if (impact.has(part)) node.dataset.highlighted = 'true';
      triangles.push({ depth: (a[2]+b[2]+c[2])/3, node });
    }
  }
  triangles.sort((a,b) => a.depth-b.depth);
  svg.replaceChildren(...triangles.map(t=>t.node), ...markers);
}
