"""Read two upright round solids from Studio AP214 bytes with Python stdlib."""
import collections
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('step_splines', Path(__file__).with_name('smooth-turn-step-oracle.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
p21 = reader.part21
TOL = 1e-7


def near(actual, expected):
    assert abs(actual - expected) <= TOL, (actual, expected)


def verify(source, station):
    entities, schema = p21.records(source)
    assert len(schema) == 1 and schema[0].startswith('AUTOMOTIVE_DESIGN')
    assert all(target in entities for body in entities.values() for target in p21.refs(body))

    def fields(ident, kind):
        assert p21.name(entities[ident]) == kind
        return reader.fields(entities[ident])

    def ref(arg):
        ident, = p21.refs(arg)
        return ident

    def of_kind(kind):
        return [ident for ident, body in entities.items() if p21.name(body) == kind]

    def point(ident):
        xyz = tuple(reader.numbers(fields(ident, 'CARTESIAN_POINT')[1]))
        assert len(xyz) == 3 and all(map(math.isfinite, xyz))
        return xyz

    def vertex(ident):
        return point(ref(fields(ident, 'VERTEX_POINT')[1]))

    def sense(arg):
        assert arg in [[('enum', '.T.')], [('enum', '.F.')]]
        return 1 if arg[0][1] == '.T.' else -1

    def seam(ident, start, end):
        origin, vector = map(ref, fields(ident, 'LINE')[1:3])
        vector_args = fields(vector, 'VECTOR')
        direction = reader.numbers(fields(ref(vector_args[1]), 'DIRECTION')[1])
        magnitude, = reader.numbers(vector_args[2])
        assert len(direction) == 3 and magnitude > 0 and math.isfinite(magnitude)
        assert direction[:2] == [0, 0] and abs(direction[2]) == 1
        origin_xy = point(origin)[:2]
        assert math.dist(origin_xy, start[:2]) < TOL
        assert math.dist(origin_xy, end[:2]) < TOL and direction[2] * (end[2] - start[2]) > TOL

    def circular_half(poles, weights, a, b):
        assert len(poles) == len(weights) == 5
        assert math.dist(a, poles[0]) < TOL and math.dist(b, poles[-1]) < TOL
        x, y, z = [(a[k] + b[k]) / 2 for k in range(3)]
        radius = math.hypot(a[0] - x, a[1] - y)
        assert radius > TOL
        for pole in poles:
            near(pole[2], z)
        ux, uy = a[0] - x, a[1] - y
        vx, vy = poles[2][0] - x, poles[2][1] - y
        near(math.hypot(vx, vy), radius)
        near((ux * vx + uy * vy) / radius, 0)
        for actual, expected in zip(weights, [1, math.sqrt(.5), 1, math.sqrt(.5), 1]):
            near(actual / weights[0], expected)
        for actual, expected in zip(poles[1][:2] + poles[3][:2], (a[0]+vx, a[1]+vy, b[0]+vx, b[1]+vy)):
            near(actual, expected)
        return (x, y, z, radius), (vx, vy)

    def circle_loop(curves):
        assert len(curves) == 2
        (a, first), (b, second) = curves
        for actual, expected in zip(a, b):
            near(actual, expected)
        near(math.hypot(first[0] + second[0], first[1] + second[1]), 0)
        return a

    representation, = of_kind('ADVANCED_BREP_SHAPE_REPRESENTATION')
    arguments = fields(representation, 'ADVANCED_BREP_SHAPE_REPRESENTATION')
    supplied = p21.refs(arguments[1])
    context = reader.components(entities[ref(arguments[2])])
    units = p21.refs(reader.fields(context['GLOBAL_UNIT_ASSIGNED_CONTEXT'])[0])
    length_unit, = [reader.components(entities[ident]) for ident in units if ('word', 'LENGTH_UNIT') in entities[ident]]
    assert reader.fields(length_unit['SI_UNIT']) == [[('enum', '.MILLI.')], [('enum', '.METRE.')]]
    solids = of_kind('MANIFOLD_SOLID_BREP')
    assert len(solids) == 2 and all(root in supplied for root in solids)
    reports = []
    owned_faces, owned_vertices = set(), set()
    for root in solids:
        shell = ref(fields(root, 'MANIFOLD_SOLID_BREP')[1])
        faces = p21.refs(fields(shell, 'CLOSED_SHELL')[1])
        assert len(set(faces)) == len(faces) and not (owned_faces & set(faces))
        owned_faces.update(faces)
        edges, vertices, caps, walls = collections.defaultdict(list), set(), [], []
        for face in faces:
            args = fields(face, 'ADVANCED_FACE')
            support = ref(args[2])
            face_sense = sense(args[3])
            rings = []
            for boundary in p21.refs(args[1]):
                kind = p21.name(entities[boundary])
                assert kind in ['FACE_OUTER_BOUND', 'FACE_BOUND']
                bound = fields(boundary, kind)
                assert sense(bound[2]) == 1
                loop = p21.refs(fields(ref(bound[1]), 'EDGE_LOOP')[1])
                ends, curves = [], []
                for oriented in loop:
                    use = fields(oriented, 'ORIENTED_EDGE')
                    edge, sign = ref(use[3]), sense(use[4])
                    edges[edge].append(sign)
                    edge_args = fields(edge, 'EDGE_CURVE')
                    a, b, shape = map(ref, edge_args[1:4])
                    assert sense(edge_args[4]) == 1
                    vertices.update((a, b))
                    ends.append((a, b) if sign == 1 else (b, a))
                    if p21.name(entities[shape]) == 'LINE':
                        seam(shape, vertex(a), vertex(b))
                    else:
                        curve = reader.spline(entities[shape], point)
                        assert curve['degree'] == [2] and curve['rational'] and curve['multiplicities'] == [[3, 2, 3]]
                        curves.append(circular_half(curve['poles'][0], curve['weights'][0], vertex(a), vertex(b)))
                assert ends and all(end == ends[(i + 1) % len(ends)][0] for i, (_, end) in enumerate(ends))
                rings.append((kind, curves))
            if p21.name(entities[support]) == 'PLANE':
                placement = fields(ref(fields(support, 'PLANE')[1]), 'AXIS2_PLACEMENT_3D')
                z = point(ref(placement[1]))[2]
                normal = reader.numbers(fields(ref(placement[2]), 'DIRECTION')[1])
                assert normal[:2] == [0, 0] and abs(normal[2]) == 1
                cap = sorted([(kind, circle_loop(curves)) for kind, curves in rings], reverse=True)
                assert cap[0][0] == 'FACE_OUTER_BOUND' and all(kind == 'FACE_BOUND' for kind, _ in cap[1:])
                for _, circle in cap:
                    near(circle[2], z)
                caps.append((z, face_sense * normal[2], [circle for _, circle in cap]))
                continue
            assert len(rings) == 1 and rings[0][0] == 'FACE_OUTER_BOUND' and len(rings[0][1]) == 2
            wall = reader.spline(entities[support], point, surface=True)
            assert wall['degree'] == [2, 1] and wall['rational']
            assert wall['multiplicities'] == [[3, 2, 3], [2, 2]]
            stations = []
            for column in range(2):
                poles = [row[column] for row in wall['poles']]
                weights = [row[column] for row in wall['weights']]
                frame, middle = circular_half(poles, weights, poles[0], poles[-1])
                assert any(math.dist(frame, ring) < TOL and math.dist(middle, arc) < TOL for ring, arc in rings[0][1])
                stations.append(frame)
            for a, b in wall['poles']:
                assert math.dist(a[:2], b[:2]) < TOL
            a, tangent = [row[0] for row in wall['poles'][:2]]
            axial = stations[1][2] - stations[0][2]
            x, y, _, radius = stations[0]
            radial_dot = axial * ((tangent[1]-a[1])*(a[0]-x) - (tangent[0]-a[0])*(a[1]-y))
            assert abs(radial_dot) > TOL
            walls.append((stations, math.copysign(1, face_sense * radial_dot)))
        assert len(caps) == 2 and not (owned_vertices & vertices)
        owned_vertices.update(vertices)
        assert all(sorted(uses) == [-1, 1] for uses in edges.values())
        (lo, lower_direction, lower), (hi, upper_direction, upper) = sorted(caps)
        assert (lower_direction, upper_direction) == (-1, 1)
        expected = [(0, 0, 12), (0, 0, 4)] if len(lower) == 2 else [(6, 6, 3)]
        assert len(lower) == len(upper) == len(expected)
        assert len(faces) == 2 + 2*len(expected) and len(walls) == 2*len(expected)
        assert len(vertices) == 4*len(expected) and len(edges) == 6*len(expected)
        target_z = [station, station + 6] if len(expected) == 2 else [0, station]
        near(lo, target_z[0])
        near(hi, target_z[1])
        for cap, z in [(lower, lo), (upper, hi)]:
            for circle, (x, y, radius) in zip(cap, expected):
                assert math.dist(circle, (x, y, z, radius)) < TOL
        supports = collections.Counter()
        for (first, second), direction in walls:
            assert sorted([first[2], second[2]]) == [lo, hi]
            assert math.dist((first[0], first[1], first[3]), (second[0], second[1], second[3])) < TOL
            candidates = [index for index, candidate in enumerate(expected)
                          if math.dist((first[0], first[1], first[3]), candidate) < TOL]
            index, = candidates
            assert direction == (1 if index == 0 else -1)
            supports[index] += 1
        assert all(supports[i] == 2 for i in range(len(expected)))
        volume = math.pi * (lower[0][3]**2 - sum(circle[3]**2 for circle in lower[1:])) * (hi-lo)
        reports.append({'shape': 'tube' if len(expected) == 2 else 'post', 'capStations': [lo, hi],
                        'radii': [circle[3] for circle in lower], 'volumeMM3': volume, 'faces': len(faces)})
    assert {item['shape'] for item in reports} == {'tube', 'post'}
    return {'status': 'PASS', 'units': 'mm', 'solids': reports}


if __name__ == '__main__':
    source = Path(sys.argv[1]).read_text()
    station = int(sys.argv[2])
    result = verify(source, station)
    wrong_seam, replaced = re.subn(r"(=LINE\('',)#[1-9][0-9]*", r"\g<1>#999999", source, count=1)
    assert replaced == 1 and '#999999=' not in source
    wrong_seam = wrong_seam.replace('DATA;', "DATA;\n#999999=CARTESIAN_POINT('',(1000.,1000.,1000.));", 1)
    controls = {
        'wrong-active-unit': (source.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT(.CENTI.,.METRE.)', 1), station),
        'incorrect-end-station': (source, station + 1),
        'inner-loop-as-outer': (source.replace('=FACE_BOUND(', '=FACE_OUTER_BOUND(', 1), station),
        'displaced-axial-seam': (wrong_seam, station),
    }
    for name, (changed, height) in controls.items():
        assert (changed, height) != (source, station)
        try:
            verify(changed, height)
        except AssertionError:
            continue
        raise AssertionError('negative control survived: ' + name)
    result['negativeControls'] = list(controls)
    print(json.dumps(result))
