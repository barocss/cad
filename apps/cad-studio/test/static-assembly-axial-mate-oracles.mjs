// Shared D760 native inspection and independent fixed-profile oracle.
export const inspectorSource = String.raw`
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cylinderPart, starterDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
if (JSON.parse(process.argv[3]) === 'fixture') {
  console.log(JSON.stringify({ ...starterDoc(), instances: [{
    id: 'pin', name: 'Pin', position: [80, 16, 0], rotation: [0, 0, 0], doc: cylinderPart(4, 20),
  }] }));
} else {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const read = (source, faces) => {
    const r = evaluateDoc(source, 0);
    if (!r.ok) assert.fail(JSON.stringify(r.error));
    assert.equal(r.bodies.length, 1);
    const b = r.bodies[0];
    return { volume: b.volume, centroid: b.centroid, faces: Object.fromEntries(faces.map(name => [name, r.faceTable[name]])) };
  };
  console.log(JSON.stringify({ holder: read(doc, ['n2.side0', 'n1.top']), pin: read(doc.instances[0].doc, ['n1.side0', 'n1.bottom']) }));
}
`;

export const oracleSource = String.raw`
import json, math, sys
x = json.load(sys.stdin)
d, n, z = x["doc"], x["native"], x["z"]
pin = d["instances"][0]
def near(a, b):
    assert len(a) == len(b) and all(abs(v-w) <= 1e-9 for v,w in zip(a,b)), (a,b)
near(pin["position"], [32,16,z])
near(pin["rotation"], [0,0,0])
assert math.isclose(n["holder"]["volume"], 16384-128*math.pi, rel_tol=1e-9)
assert math.isclose(n["pin"]["volume"], 320*math.pi, rel_tol=1e-9)
near(n["holder"]["centroid"], [32,16,4])
near(n["pin"]["centroid"], [0,0,10])
for face, axis in [(n["holder"]["faces"]["n2.side0"],[32,16]), (n["pin"]["faces"]["n1.side0"],[0,0])]:
    assert face["kind"] in ("bore", "cylinder"), face
    near(face["point"][:2], axis)
    near([abs(a) for a in face["axis"]], [0,0,1])
    assert abs(face["radius"]-4) <= 1e-9
cap, bottom = n["holder"]["faces"]["n1.top"], n["pin"]["faces"]["n1.bottom"]
assert cap["kind"] == bottom["kind"] == "plane"
assert abs(cap["point"][2]-8) <= 1e-9 and abs(bottom["point"][2]) <= 1e-9
near(cap["normal"], [0,0,1])
near(bottom["normal"], [0,0,-1])
near(x["bounds"][0]["min"], [28,12,z])
near(x["bounds"][0]["max"], [36,20,z+20])
m = d["mates"][0]
assert (m["kind"], m["a"]["part"], m["a"]["face"], m["b"]["part"], m["b"]["face"]) == ("concentric","base","n2.side0","pin","n1.side0")
if "distance" in x:
    m = d["mates"][1]
    assert len(d["mates"]) == 2 and m["kind"] == "distance"
    assert (m["a"]["part"], m["a"]["face"], m["b"]["part"], m["b"]["face"]) == ("base","n1.top","pin","n1.bottom")
    assert m.get("distance",0) == x["distance"] and z == 8+x["distance"]
else:
    assert len(d["mates"]) == 1
print(json.dumps({"status":"PASS","axis":[32,16],"pinZ":z,"holderVolume":n["holder"]["volume"],"pinVolume":n["pin"]["volume"]}))
`;
