"""Independent AP214 graph and cubic-spline section reads for the D1542 part."""
import bisect
import collections
import importlib.util
import json
import math
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('part21_graph', Path(__file__).with_name('part21-prism-check.py'))
part21 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(part21)


def fields(record):
    assert record[0][0] == 'word' and record[1] == ('punct', '(') and record[-1] == ('punct', ')')
    result, arg, depth = [], [], 0
    for token in record[2:-1]:
        if depth == 0 and token == ('punct', ','):
            result.append(arg)
            arg = []
            continue
        depth += (token == ('punct', '(')) - (token == ('punct', ')'))
        arg.append(token)
    assert depth == 0
    return result + [arg]


def numbers(arg):
    return [float(value) for kind, value in arg if kind == 'number']


def label(arg):
    assert len(arg) == 1 and arg[0][0] == 'string'
    return arg[0][1][1:-1]


def distance(a, b):
    return math.dist(a, b)


def cubic(poles, knots, t):
    if t == knots[-1]:
        return poles[-1]
    span = bisect.bisect_right(knots, t) - 1
    points = [list(point) for point in poles[span - 3:span + 1]]
    for level in range(1, 4):
        for j in range(3, level - 1, -1):
            i = span - 3 + j
            blend = (t - knots[i]) / (knots[i + 4 - level] - knots[i])
            points[j] = [(1 - blend) * a + blend * b for a, b in zip(points[j - 1], points[j])]
    return points[3]


def verify(source):
    entities, schema = part21.records(source)
    assert len(schema) == 1 and schema[0].startswith('AUTOMOTIVE_DESIGN')
    assert all(target in entities for record in entities.values() for target in part21.refs(record))
    units = {ident: record for ident, record in entities.items() if ('word', 'LENGTH_UNIT') in record}
    mm = [('word', 'SI_UNIT'), ('punct', '('), ('enum', '.MILLI.'), ('punct', ','), ('enum', '.METRE.'), ('punct', ')')]
    assert len(units) == 1
    millimetre, = units
    unit = units[millimetre]
    assert any(unit[i:i + len(mm)] == mm for i in range(len(unit)))

    def of_kind(ident, name):
        record = entities[ident]
        assert part21.name(record) == name, (ident, name, part21.name(record))
        return fields(record)

    def point(ident):
        coords = numbers(of_kind(ident, 'CARTESIAN_POINT')[1])
        assert len(coords) == 3 and all(map(math.isfinite, coords))
        return coords

    def vertex(ident):
        return point(part21.refs(of_kind(ident, 'VERTEX_POINT')[1])[0])

    shape, = [fields(record) for record in entities.values() if part21.name(record) == 'ADVANCED_BREP_SHAPE_REPRESENTATION']
    context, = part21.refs(shape[2])
    global_units = entities[context]
    start = global_units.index(('word', 'GLOBAL_UNIT_ASSIGNED_CONTEXT'))
    stop = global_units.index(('word', 'REPRESENTATION_CONTEXT'), start)
    assert millimetre in part21.refs(global_units[start:stop])
    solid_ids = [ident for ident, record in entities.items() if part21.name(record) == 'MANIFOLD_SOLID_BREP']
    assert len(solid_ids) == 2 and set(solid_ids) <= set(part21.refs(shape[1]))
    solids = {label(of_kind(ident, 'MANIFOLD_SOLID_BREP')[0]): part21.refs(of_kind(ident, 'MANIFOLD_SOLID_BREP')[1])[0]
              for ident in solid_ids}
    assert set(solids) == {'n7', 'n21'}
    expected_counts = {'n7': (18, 36, 20), 'n21': (6, 12, 8)}
    rails, supports = {}, {}
    for solid, shell in solids.items():
        faces = part21.refs(of_kind(shell, 'CLOSED_SHELL')[1])
        uses, vertices = collections.defaultdict(list), set()
        for face in faces:
            face_fields = of_kind(face, 'ADVANCED_FACE')
            name = label(face_fields[0])
            boundary, = part21.refs(face_fields[1])
            loop, = part21.refs(of_kind(boundary, 'FACE_OUTER_BOUND')[1])
            oriented = part21.refs(of_kind(loop, 'EDGE_LOOP')[1])
            assert len(oriented) == 4
            ends = []
            for use in oriented:
                args = of_kind(use, 'ORIENTED_EDGE')
                edge, = part21.refs(args[3])
                sense, = args[4]
                a, b, curve = part21.refs(entities[edge])
                vertices.update((a, b))
                uses[edge].append(sense)
                ends.append((a, b) if sense == ('enum', '.T.') else (b, a))
                if solid == 'n21' and part21.name(entities[curve]) == 'B_SPLINE_CURVE_WITH_KNOTS':
                    rails[edge] = (vertex(a), vertex(b), of_kind(curve, 'B_SPLINE_CURVE_WITH_KNOTS'))
            assert all(pair[1] == ends[(i + 1) % len(ends)][0] for i, pair in enumerate(ends))
            if solid == 'n21' and name.startswith('n21.side'):
                surface, = part21.refs(face_fields[2])
                supports[int(name[-1])] = of_kind(surface, 'B_SPLINE_SURFACE_WITH_KNOTS')
            elif solid == 'n21':
                assert name in {'n21.bottom', 'n21.top'}
                surface, = part21.refs(face_fields[2])
                of_kind(surface, 'PLANE')
        assert (len(faces), len(uses), len(vertices)) == expected_counts[solid]
        assert all(sorted(orientation) == [('enum', '.F.'), ('enum', '.T.')] for orientation in uses.values())

    assert len(rails) == len(supports) == 4
    corners = [(-10, -4), (10, -4), (10, 4), (-10, 4)]
    curves, max_error = [], 0
    for x, y in corners:
        start = [47 + x, -11 + y, 3]
        a, b, args = next(rail for rail in rails.values() if distance(rail[0], start) < 1e-8)
        assert distance(b, [start[0], start[1], 43]) < 1e-8
        assert numbers(args[1]) == [3]
        pole_ids = part21.refs(args[2])
        multiplicities, values = list(map(int, numbers(args[6]))), numbers(args[7])
        assert len(pole_ids) == 13 and multiplicities == [4] + [1] * 9 + [4]
        assert len(values) == len(multiplicities) and values[0] == 0 and values[-1] == 1
        assert all(x1 > x0 for x0, x1 in zip(values, values[1:]))
        knots = [value for value, n in zip(values, multiplicities) for _ in range(n)]
        poles = list(map(point, pole_ids))
        assert poles[0] == a and poles[-1] == b
        for i, pole in enumerate(poles):
            # Cubic Greville coefficients reproduce the linear axial coordinate.
            assert abs(pole[2] - (3 + 40 * sum(knots[i + 1:i + 4]) / 3)) < 1e-8
        for station in range(13):
            t = station / 12
            c, s = math.cos(2 * math.pi * t), math.sin(2 * math.pi * t)
            expected = [47 + c * x - s * y, -11 + s * x + c * y, 3 + 40 * t]
            max_error = max(max_error, distance(cubic(poles, knots, t), expected))
        curves.append((poles, knots, pole_ids, values))
    assert max_error < 1e-8
    for i, surface in supports.items():
        first, second = curves[i], curves[(i + 1) % 4]
        assert numbers(surface[1]) == [1] and numbers(surface[2]) == [3]
        assert part21.refs(surface[3]) == first[2] + second[2]
        assert numbers(surface[8]) == [2, 2] and numbers(surface[9]) == [4] + [1] * 9 + [4]
        assert numbers(surface[10]) == [0, 1] and numbers(surface[11]) == first[3] == second[3]

    def area(t):
        xy = [cubic(poles, knots, t) for poles, knots, _, _ in curves]
        return sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(xy, xy[1:] + xy[:1])) / 2

    # In each knot span the polygon area is a polynomial of degree at most six.
    weights = ((-0.8611363115940526, 0.3478548451374539), (-0.3399810435848563, 0.6521451548625461),
               (0.3399810435848563, 0.6521451548625461), (0.8611363115940526, 0.3478548451374539))
    values = curves[0][3]
    volume = 40 * sum((b - a) / 2 * sum(w * area((a + b + (b - a) * p) / 2) for p, w in weights)
                      for a, b in zip(values, values[1:]))
    for exponent, measure in [(2, 'AREA_MEASURE'), (3, 'VOLUME_MEASURE')]:
        item, = [fields(record) for record in entities.values() if part21.name(record) == 'MEASURE_REPRESENTATION_ITEM'
                 and ('word', measure) in record]
        derived, = part21.refs(item[2])
        element, = part21.refs(of_kind(derived, 'DERIVED_UNIT')[0])
        scale = of_kind(element, 'DERIVED_UNIT_ELEMENT')
        assert part21.refs(scale[0]) == [millimetre] and numbers(scale[1]) == [exponent]
        if exponent == 3:
            stored, = numbers(item[1])
            assert abs(stored - (volume + 2560)) < 1e-7
    return {'schema': schema, 'solids': expected_counts, 'unit': 'mm', 'cubicRails': len(rails),
            'stationMaxErrorMM': max_error, 'smoothVolumeMM3': volume}


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1]).read_text(encoding='utf-8'))))
