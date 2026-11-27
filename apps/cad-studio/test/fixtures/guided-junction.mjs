const bknots = degree => [...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)];
const curves = {
  bodyEdge: [[0, 0, 0], [30, 0, 0]],
  handleEdge: [[30, 0, 0], [15, 12, 0], [0, 24, 12]],
  sideEdge: [[0, 0, 0], [0, 12, 0], [0, 24, 12]],
  guide: [[7.5, 0, 0], [7.5, 6, 0], [7.5, 12, 5.625], [7.5, 18, 6.75]],
  disconnected: [[7.5, 0, 0], [7.5, 6, 0], [7.5, 12, 5.625], [7.5, 18, 7]],
};
const curveSource = poles => `@model junction { version:0; length-unit:mm;
  @curve #shape { type:nurbs; degree:${poles.length - 1}; knots:${JSON.stringify(bknots(poles.length - 1))};
    control-points:${JSON.stringify(poles)}; weights:${JSON.stringify(poles.map(() => 1))}; } }`;
const surfaceSource = (points, p, q) => `@model junction { version:0; length-unit:mm;
  @surface #shape { type:nurbs; degree-u:${p}; degree-v:${q}; knots-u:${JSON.stringify(bknots(p))}; knots-v:${JSON.stringify(bknots(q))};
    control-points:${JSON.stringify(points)}; weights:${JSON.stringify(points.map(row => row.map(() => 1)))}; } }`;
const source = Object.fromEntries(Object.entries(curves).map(([id, poles]) => [id, curveSource(poles)]));
source.body = surfaceSource([[[0,-12,0],[0,0,0]],[[30,-12,0],[30,0,0]]], 1, 1);
const shoulder = rows => surfaceSource(rows.map(row => row.map((x,j) => [x,12*j,[0,0,12][j]])),1,2);
source.leftShoulder = shoulder([[-7.5,-7.5,-7.5],[0,0,0]]);
source.rightShoulder = shoulder([[30,15,0],[37.5,22.5,7.5]]);
const object = id => ({ id, name: id, geometry: 'shape', source: id });
export const guidedJunctionDocument = { format:'barocss-cad-model', schema:3, units:'mm', parameters:{}, nodes:[], outputs:{}, nextId:0,
  direct: { sources: source, objects: Object.keys(source).map(object) } };
