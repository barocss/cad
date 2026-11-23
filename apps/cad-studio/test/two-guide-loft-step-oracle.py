"""Independent AP214 topology and Bézier support check for the D1280 taper."""
import collections
import importlib.util
import json
import math
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('step_splines', Path(__file__).with_name('smooth-turn-step-oracle.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
p21 = reader.part21


def bezier(points, t):
    return tuple(sum(math.comb(len(points) - 1, j) * (1 - t) ** (len(points) - 1 - j) * t ** j * point[k]
                     for j, point in enumerate(points)) for k in range(3))


def verify(source, middle):
    entities, schema = p21.records(source)
    assert len(schema) == 1 and schema[0].startswith('AUTOMOTIVE_DESIGN')
    assert all(target in entities for record in entities.values() for target in p21.refs(record))

    def fields(ident, kind):
        assert p21.name(entities[ident]) == kind
        return reader.fields(entities[ident])

    def of_kind(kind):
        return [i for i, record in entities.items() if p21.name(record) == kind]

    def ref(arg):
        ident, = p21.refs(arg)
        return ident

    def point(i):
        xyz = tuple(reader.numbers(fields(i, 'CARTESIAN_POINT')[1]))
        assert len(xyz) == 3 and all(map(math.isfinite, xyz))
        return xyz

    def vertex(i):
        return point(ref(fields(i, 'VERTEX_POINT')[1]))

    def ring(t):
        x = 4 * t * (1 - t)
        w = 10 + 4*t + 2*(middle-14)*t*(1-t)
        d, z = w * (3/5 - 11*t/35), 12*t
        return [(x, 0, z), (x+w, 0, z), (x+w, d, z), (x, d, z)]

    unit, = [record for record in entities.values() if ('word', 'LENGTH_UNIT') in record]
    assert reader.fields(reader.components(unit)['SI_UNIT']) == [[('enum', '.MILLI.')], [('enum', '.METRE.')]]
    solid, = of_kind('MANIFOLD_SOLID_BREP')
    shell = ref(fields(solid, 'MANIFOLD_SOLID_BREP')[1])
    faces = p21.refs(fields(shell, 'CLOSED_SHELL')[1])
    assert len(set(faces)) == len(faces) == 6

    uses, vertices, wall_edges = collections.defaultdict(list), set(), set()
    walls, caps = [], []
    for face in faces:
        args = fields(face, 'ADVANCED_FACE')
        bound = fields(ref(args[1]), 'FACE_OUTER_BOUND')
        assert bound[2] == [('enum', '.T.')]
        loop = p21.refs(fields(ref(bound[1]), 'EDGE_LOOP')[1])
        assert len(loop) == 4
        ends = []
        for oriented in loop:
            use = fields(oriented, 'ORIENTED_EDGE')
            edge = ref(use[3])
            sense, = use[4]
            assert sense in (('enum', '.T.'), ('enum', '.F.'))
            uses[edge].append(sense)
            edge_args = fields(edge, 'EDGE_CURVE')
            a, b, curve = map(ref, edge_args[1:4])
            assert edge_args[4] == [('enum', '.T.')]
            vertices.update((a, b))
            ends.append((a, b) if sense[1] == '.T.' else (b, a))
            pa, pb = vertex(a), vertex(b)
            if pa[2] != pb[2]:
                wall_edges.add(edge)
                rail = reader.spline(entities[curve], point)
                assert not rail['rational'] and rail['degree'] == [2 if pa[1] == 0 else 3]
                pole, = rail['poles']
                backwards = pa[2] > pb[2]
                lane = ring(0).index(pb if backwards else pa)
                for i in range(17):
                    t = i / 16
                    assert math.dist(bezier(pole, 1-t if backwards else t), ring(t)[lane]) < 1e-10
            else:
                assert p21.name(entities[curve]) == 'LINE'
        assert all(end == ends[(i + 1) % 4][0] for i, (_, end) in enumerate(ends))
        support = ref(args[2])
        if p21.name(entities[support]) == 'PLANE':
            placement = fields(ref(fields(support, 'PLANE')[1]), 'AXIS2_PLACEMENT_3D')
            z = point(ref(placement[1]))[2]
            normal = reader.numbers(fields(ref(placement[2]), 'DIRECTION')[1])
            assert z in (0, 12) and abs(normal[2]) == 1 and normal[:2] == [0, 0]
            sense = 1 if args[3] == [('enum', '.T.')] else -1
            assert sense * normal[2] == (-1 if z == 0 else 1)
            assert {vertex(a) for a, _ in ends} == set(ring(z / 12))
            caps.append(z)
            continue
        surface = reader.spline(entities[support], point, surface=True)
        assert surface['degree'] == [1, 3] and not surface['rational']
        first, second = surface['poles']
        lane = ring(0).index(first[0])
        assert second[0] == ring(0)[(lane + 1) % 4]
        walls.append(lane)
        for i in range(17):
            t = i / 16
            a, b = bezier(first, t), bezier(second, t)
            expected = ring(t)
            assert math.dist(a, expected[lane]) < 1e-10
            assert math.dist(b, expected[(lane + 1) % 4]) < 1e-10

    assert set(walls) == {0, 1, 2, 3} and len(walls) == 4
    assert sorted(caps) == [0, 12] and len(wall_edges) == 4
    assert len(vertices) == 8 and len(uses) == 12 and sum(map(len, uses.values())) == 24
    assert all(sorted(sense) == [('enum', '.F.'), ('enum', '.T.')] for sense in uses.values())
    return {'status': 'PASS', 'vertices': 8, 'edges': 12, 'faces': 6, 'capPlanes': sorted(caps),
            'cubicWalls': len(walls), 'testedStations': 17}


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1]).read_text(), int(sys.argv[2]))))
