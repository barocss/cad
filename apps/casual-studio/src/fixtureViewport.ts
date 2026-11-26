import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

export type FixturePart = 'body' | 'lid' | 'board' | 'left' | 'right';
export type FixtureBody = { mesh: BodyResult['mesh']; part: FixturePart };
export type FixtureView = 'exploded' | 'inside' | 'assembled';
const palette: Record<FixturePart, readonly [number, number, number]> = {
  body: [110, 146, 174], lid: [150, 181, 207], board: [81, 158, 136], left: [205, 156, 79], right: [205, 156, 79],
};
const svgNS = 'http://www.w3.org/2000/svg';
type XYZ = [number, number, number];
const lifts = (part: FixturePart, view: FixtureView) => view !== 'exploded' ? 0 : part === 'lid' ? 27 : part === 'board' ? 14 : 0;

export function drawFixture(svg: SVGSVGElement, bodies: FixtureBody[], view: FixtureView, impact: ReadonlySet<FixturePart>, isolated = false, model: 'sensor' | 'vise' = 'sensor') {
  const project = (x: number, y: number, z: number): XYZ => [.87*x + .50*y, .24*x - .42*y - .87*z, .44*x - .75*y + .48*z];
  // Fixed world frame across widths gives the preview an honest overlay: no rescale or recenter on a width edit.
  const [centerX, centerY] = model === 'vise' ? [0,-8] : view === 'exploded' ? [41, -21] : [41, -10];
  const scale = model === 'vise' ? 4.45 : view === 'exploded' ? 5.65 : 7;
  const xy = (p: XYZ) => [400 + (p[0] - centerX)*scale, 249 + (p[1] - centerY)*scale].map(v => v.toFixed(2)).join(',');
  const markers: SVGCircleElement[] = [];
  const triangles: { layer: number; depth: number; node: SVGPolygonElement }[] = [];
  for (const { mesh, part } of bodies) {
    if (part === 'lid' && view === 'inside') continue;
    const { positions, normals, indices } = mesh;
    const offset = lifts(part, view);
    if (model === 'sensor' && (part === 'left' || part === 'right') && impact.has(part)) {
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
      const material = model==='vise' && (part==='left' || part==='right') ? palette.lid : palette[part];
      const rgb = impact.has(part) ? material.map((value,i) => value * (1-blend) + [75,125,224][i] * blend) : material;
      const fill = 'rgb(' + rgb.map(value => Math.round(value * lit)).join(' ') + ')';
      const node = document.createElementNS(svgNS, 'polygon');
      node.setAttribute('points', [a,b,c].map(xy).join(' '));
      node.setAttribute('fill', fill); node.setAttribute('stroke', fill); node.setAttribute('stroke-width', '.65');
      if (model === 'sensor') node.dataset.sensorPart = part; else node.dataset.visePart = part;
      if (impact.has(part)) node.dataset.highlighted = 'true';
      // In this fixed above-datum vise view, the raised jaws never overlap each other in projection.
      // Paint their whole silhouettes above the base, and clip bore walls by painting the outer base after them.
      // Sorting only by triangle-centroid depth lets large base triangles punch through the jaws.
      const layer = model !== 'vise' ? 0 : part !== 'body' ? 2 : mesh.faces[mesh.faceOfVertex[n]]?.kind === 'curved' ? 0 : 1;
      triangles.push({ layer, depth: (a[2]+b[2]+c[2])/3, node });
    }
  }
  triangles.sort((a,b) => a.layer-b.layer || a.depth-b.depth);
  const contents: SVGElement[] = [...triangles.map(t=>t.node), ...markers];
  if (model === 'vise') {
    const left = bodies.find(b=>b.part==='left')!, right=bodies.find(b=>b.part==='right')!;
    const guide = document.createElementNS(svgNS, 'line');
    const [x1,y1] = xy(project(left.mesh.bounds.max[0],-12,13)).split(',');
    const [x2,y2] = xy(project(right.mesh.bounds.min[0],-12,13)).split(',');
    for (const [key,value] of Object.entries({x1,y1,x2,y2, stroke:'#235593','stroke-dasharray':'6 5','stroke-width':'2'})) guide.setAttribute(key,value);
    guide.dataset.visePart='gap';
    const hit = guide.cloneNode() as SVGLineElement;
    hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','20');
    contents.push(guide,hit);
  }
  svg.replaceChildren(...contents);
}
