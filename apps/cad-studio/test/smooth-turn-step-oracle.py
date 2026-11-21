"""Independent AP214 graph and cubic-spline section reads for the bounded Smooth Turn and Screw fixtures."""
import bisect
import collections
from fractions import Fraction
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


def components(record):
    """Split balanced complex partial entities, retaining nested lists and quoted tokens."""
    if record[0][0] == 'word':
        return {record[0][1]: record}
    assert record[0] == ('punct', '(') and record[-1] == ('punct', ')')
    result, at = {}, 1
    while at < len(record) - 1:
        assert record[at][0] == 'word' and record[at + 1] == ('punct', '(')
        start, depth = at, 1
        at += 2
        while depth:
            assert at < len(record) - 1
            depth += (record[at] == ('punct', '(')) - (record[at] == ('punct', ')'))
            at += 1
        name = record[start][1]
        assert name not in result, 'duplicate complex component ' + name
        result[name] = record[start:at]
    assert at == len(record) - 1
    return result


def members(arg):
    assert arg[0] == ('punct', '(') and arg[-1] == ('punct', ')')
    return fields([('word', 'LIST'), *arg])


def scalar_list(arg, kind):
    result = []
    for item in members(arg):
        assert len(item) == 1 and item[0][0] == kind
        result.append(int(item[0][1][1:]) if kind == 'ref' else float(item[0][1]))
    assert result and (kind != 'number' or all(map(math.isfinite, result)))
    return result


def spline(record, point, surface=False):
    """Read only explicit knot forms of the writer's polynomial/rational B-splines."""
    kind = 'SURFACE' if surface else 'CURVE'
    base_name, knot_name, weight_name = 'B_SPLINE_' + kind, 'B_SPLINE_' + kind + '_WITH_KNOTS', 'RATIONAL_B_SPLINE_' + kind
    parts = components(record)
    rational = weight_name in parts
    if record[0][0] == 'word':
        assert set(parts) == {knot_name}
        args = fields(record)
        degree = [numbers(args[1])[0], numbers(args[2])[0]] if surface else [numbers(args[1])[0]]
        controls = args[3] if surface else args[2]
        multiplicities = [args[8], args[9]] if surface else [args[6]]
        values = [args[10], args[11]] if surface else [args[7]]
    else:
        assert set(parts) == {'BOUNDED_' + kind, base_name, knot_name, weight_name,
                              kind, 'GEOMETRIC_REPRESENTATION_ITEM', 'REPRESENTATION_ITEM'}
        base, knots = fields(parts[base_name]), fields(parts[knot_name])
        degree = [numbers(base[0])[0], numbers(base[1])[0]] if surface else [numbers(base[0])[0]]
        controls = base[2] if surface else base[1]
        multiplicities = knots[:2] if surface else knots[:1]
        values = knots[2:4] if surface else knots[1:2]
    assert all(value.is_integer() and value > 0 for value in degree)
    degree = list(map(int, degree))
    ids = [scalar_list(row, 'ref') for row in members(controls)] if surface else [scalar_list(controls, 'ref')]
    assert len(set(map(len, ids))) == 1
    weights = ([scalar_list(row, 'number') for row in members(fields(parts[weight_name])[0])]
               if rational and surface else [scalar_list(fields(parts[weight_name])[0], 'number')]
               if rational else [[1.0] * len(row) for row in ids])
    assert len(weights) == len(ids) and all(len(row) == len(ids[i]) and all(w > 0 for w in row) for i, row in enumerate(weights))
    expanded, distinct, mults = [], [], []
    for d, m, v, count in zip(degree, multiplicities, values, (len(ids), len(ids[0])) if surface else (len(ids[0]),)):
        counts, knots = scalar_list(m, 'number'), scalar_list(v, 'number')
        assert len(counts) == len(knots) and all(n.is_integer() and 0 < n <= d + 1 for n in counts)
        assert counts[0] == counts[-1] == d + 1 and sum(counts) == count + d + 1
        assert knots[0] == 0 and knots[-1] == 1 and all(a < b for a, b in zip(knots, knots[1:]))
        expanded.append([value for value, n in zip(knots, counts) for _ in range(int(n))])
        distinct.append(knots)
        mults.append(list(map(int, counts)))
    return {'degree': degree, 'ids': ids, 'poles': [[point(ident) for ident in row] for row in ids],
            'weights': weights, 'knots': expanded, 'values': distinct, 'multiplicities': mults, 'rational': rational}


def certify_signed_factor(factors, knots, values, sign):
    """Exact represented-factor Bernstein signs prove nonzero radius and angular derivative."""
    poles = [[Fraction(z.real), Fraction(z.imag)] for z in factors]
    knots = list(map(Fraction, knots))

    def evaluate(control, basis, t, degree):
        if t == basis[-1]:
            return control[-1]
        span = bisect.bisect_right(basis, t) - 1
        work = [list(point) for point in control[span - degree:span + 1]]
        for level in range(1, degree + 1):
            for j in range(degree, level - 1, -1):
                i = span - degree + j
                blend = (t - basis[i]) / (basis[i + degree + 1 - level] - basis[i])
                work[j] = [(1 - blend) * a + blend * b for a, b in zip(work[j - 1], work[j])]
        return work[-1]

    derivative = [[3 * (b - a) / (knots[i + 4] - knots[i + 1]) for a, b in zip(poles[i], poles[i + 1])]
                  for i in range(len(poles) - 1)]
    minimum = None
    for low, high in zip(values, values[1:]):
        a, b = Fraction(low), Fraction(high)
        p, q = evaluate(poles, knots, a, 3), evaluate(poles, knots, b, 3)
        dp, dq = evaluate(derivative, knots[1:-1], a, 2), evaluate(derivative, knots[1:-1], b, 2)
        bezier = [p, [x + (b - a) * d / 3 for x, d in zip(p, dp)],
                  [x - (b - a) * d / 3 for x, d in zip(q, dq)], q]
        differences = [[y - x for x, y in zip(bezier[j], bezier[j + 1])] for j in range(3)]
        coefficients = [Fraction(0)] * 6
        for i, point in enumerate(bezier):
            for j, d in enumerate(differences):
                coefficients[i + j] += sign * math.comb(3, i) * math.comb(2, j) * (point[0] * d[1] - point[1] * d[0])
        assert all(coefficient > 0 for coefficient in coefficients), 'signed angular derivative is not certified'
        bound = min(coefficient / math.comb(5, i) for i, coefficient in enumerate(coefficients))
        minimum = bound if minimum is None else min(minimum, bound)
    return float(minimum)


def verify_line_arc(source, variant):
    """Bounded fixture proof from AP214 bytes, without product geometry or imported volume."""
    angle, height, turn = (-450 if variant.endswith('-negative') else 450), 50, 'n18'
    origin, axis_v, axis_w = (21, -19.4, 24.8), (0, .8, -.6), (0, .6, .8)
    y, weight = 3 * math.sin(math.pi / 3), math.cos(math.pi / 6)
    corners = [(13.5, y), (13.5, -y), (15, 0)]
    base_rows = [[corners[0], corners[1]], [corners[1], (15, -math.sqrt(3)), corners[2]],
                 [corners[2], (15, math.sqrt(3)), corners[0]]]
    entities, schema = part21.records(source)
    assert len(schema) == 1 and schema[0].startswith('AUTOMOTIVE_DESIGN')
    assert all(target in entities for record in entities.values() for target in part21.refs(record))

    def args(ident, name):
        assert part21.name(entities[ident]) == name, (ident, name)
        return fields(entities[ident])

    def point(ident):
        coords = scalar_list(args(ident, 'CARTESIAN_POINT')[1], 'number')
        assert len(coords) == 3
        return coords

    def local(p):
        delta = [a - b for a, b in zip(p, origin)]
        return (delta[0], sum(a * b for a, b in zip(delta, axis_v)), sum(a * b for a, b in zip(delta, axis_w)))

    def world(q, z):
        return [origin[0] + q.real, *[origin[i] + q.imag * axis_v[i] + z * axis_w[i] for i in (1, 2)]]

    units = {ident: record for ident, record in entities.items() if ('word', 'LENGTH_UNIT') in record}
    assert len(units) == 1
    millimetre, = units
    unit = fields(components(units[millimetre])['SI_UNIT'])
    assert unit == [[('enum', '.MILLI.')], [('enum', '.METRE.')]]
    shape, = [fields(record) for record in entities.values() if part21.name(record) == 'ADVANCED_BREP_SHAPE_REPRESENTATION']
    context, = part21.refs(shape[2])
    assert millimetre in part21.refs(fields(components(entities[context])['GLOBAL_UNIT_ASSIGNED_CONTEXT'])[0])
    solids = [ident for ident, record in entities.items() if part21.name(record) == 'MANIFOLD_SOLID_BREP']
    assert len(solids) == 1 and solids[0] in part21.refs(shape[1])
    solid = args(solids[0], 'MANIFOLD_SOLID_BREP')
    assert label(solid[0]) == turn
    shell, = part21.refs(solid[1])
    face_ids = scalar_list(args(shell, 'CLOSED_SHELL')[1], 'ref')
    assert len(face_ids) == len(set(face_ids)) == 5
    uses, vertices, rails, arc_edges, supports = collections.defaultdict(list), set(), {}, {}, {}
    cap_planes, edge_faces = {}, collections.defaultdict(set)
    for face in face_ids:
        face_args = args(face, 'ADVANCED_FACE')
        name = label(face_args[0])
        assert face_args[3] == [('enum', '.T.')]
        boundary, = part21.refs(face_args[1])
        bound = args(boundary, 'FACE_OUTER_BOUND')
        assert bound[2] == [('enum', '.T.')]
        loop, = part21.refs(bound[1])
        oriented = scalar_list(args(loop, 'EDGE_LOOP')[1], 'ref')
        cap = name in {turn + '.bottom', turn + '.top'}
        assert len(oriented) == (3 if cap else 4)
        ends = []
        for use in oriented:
            oriented_args = args(use, 'ORIENTED_EDGE')
            edge, = part21.refs(oriented_args[3])
            sense, = oriented_args[4]
            assert sense in (('enum', '.T.'), ('enum', '.F.'))
            edge_args = args(edge, 'EDGE_CURVE')
            assert edge_args[4] == [('enum', '.T.')]
            a, b, curve = [part21.refs(edge_args[i])[0] for i in (1, 2, 3)]
            vertices.update((a, b))
            uses[edge].append(sense)
            edge_faces[edge].add(name)
            ends.append((a, b) if sense == ('enum', '.T.') else (b, a))
            if part21.name(entities[curve]) != 'LINE':
                read = spline(entities[curve], point)
                a_point = point(part21.refs(args(a, 'VERTEX_POINT')[1])[0])
                b_point = point(part21.refs(args(b, 'VERTEX_POINT')[1])[0])
                assert read['poles'][0][0] == a_point and read['poles'][0][-1] == b_point
                if read['degree'] == [3]:
                    rails[edge] = read
                else:
                    assert read['degree'] == [2] and read['rational']
                    arc_edges[edge] = read
            elif cap:
                # The chord must be a real line through its two topological endpoints.
                line = args(curve, 'LINE')
                assert distance(point(part21.refs(line[1])[0]), point(part21.refs(args(a, 'VERTEX_POINT')[1])[0])) < 1e-8
                vector = args(part21.refs(line[2])[0], 'VECTOR')
                direction = scalar_list(args(part21.refs(vector[1])[0], 'DIRECTION')[1], 'number')
                magnitude, = numbers(vector[2])
                assert len(direction) == 3 and math.isfinite(magnitude) and magnitude > 0
                assert abs(math.hypot(*direction) - 1) < 1e-12
                end = [p + magnitude * d for p, d in zip(point(part21.refs(line[1])[0]), direction)]
                assert distance(end, point(part21.refs(args(b, 'VERTEX_POINT')[1])[0])) < 1e-8
        assert all(pair[1] == ends[(i + 1) % len(ends)][0] for i, pair in enumerate(ends))
        support, = part21.refs(face_args[2])
        if cap:
            placement, = part21.refs(args(support, 'PLANE')[1])
            placement_args = args(placement, 'AXIS2_PLACEMENT_3D')
            plane_origin = point(part21.refs(placement_args[1])[0])
            normal = scalar_list(args(part21.refs(placement_args[2])[0], 'DIRECTION')[1], 'number')
            sign = -1 if name.endswith('.bottom') else 1
            assert distance(normal, [sign * x for x in axis_w]) < 1e-12
            assert abs(local(plane_origin)[2] - (0 if sign < 0 else height)) < 1e-8
            cap_planes[name] = plane_origin
        else:
            assert name in {turn + '.side' + str(i) for i in range(3)} and name not in supports
            supports[name] = spline(entities[support], point, surface=True)
    assert (len(face_ids), len(uses), len(vertices)) == (5, 9, 6)
    assert len(cap_planes) == 2 and len(rails) == 3 and len(arc_edges) == 4 and len(supports) == 3
    assert all(sorted(orientation) == [('enum', '.F.'), ('enum', '.T.')] for orientation in uses.values())
    assert all(len(edge_faces[edge] & set(cap_planes)) == 1 for edge in arc_edges)
    assert all(not (edge_faces[edge] & set(cap_planes)) for edge in rails)

    curves = []
    for corner in corners:
        curve, = [read for read in rails.values() if distance(read['poles'][0][0], world(complex(*corner), 0)) < 1e-8]
        assert curve['multiplicities'] == [[4] + [1] * 12 + [4]] and len(curve['poles'][0]) == 16
        assert not curve['rational'] and curve['weights'] == [[1] * 16]
        curves.append(curve)
    knots, values = curves[0]['knots'][0], curves[0]['values'][0]
    assert all(curve['knots'][0] == knots for curve in curves)
    factors = [complex(*local(p)[:2]) / 15 for p in curves[2]['poles'][0]]
    factor = lambda t: complex(*cubic([[z.real, z.imag] for z in factors], knots, t))
    angular_bound = certify_signed_factor(factors, knots, values, 1 if angle > 0 else -1)
    station_error, axial_error, winding = 0, 0, []
    for corner, curve in zip(corners, curves):
        poles = curve['poles'][0]
        for i, p in enumerate(poles):
            axial_error = max(axial_error, abs(local(p)[2] - height * sum(knots[i + 1:i + 4]) / 3))
        for i in range(16):
            t = i / 15
            q = complex(*corner) * complex(math.cos(math.radians(angle) * t), math.sin(math.radians(angle) * t))
            station_error = max(station_error, distance(cubic(poles, knots, t), world(q, height * t)))
        xy = [complex(*local(cubic(poles, knots, i / 240))[:2]) for i in range(241)]
        increments = [math.atan2((b / a).imag, (b / a).real) for a, b in zip(xy, xy[1:])]
        assert all(step * angle > 0 for step in increments)
        total = math.degrees(sum(increments))
        assert abs(total - angle) < 1e-8
        winding.append(total)

    wall_error, cap_error, weight_error, circle_error, join_error, tangent_error = 0, 0, 0, 0, 0, 0
    def evaluate_surface(surface, u, t):
        columns = [cubic([[*[(x * w) for x in p], w] for p, w in zip(row, weights)], knots, t)
                   for row, weights in zip(surface['poles'], surface['weights'])]
        basis = [1 - u, u] if len(columns) == 2 else [(1 - u) ** 2, 2 * u * (1 - u), u * u]
        result = [sum(b * p[k] for b, p in zip(basis, columns)) for k in range(4)]
        assert result[3] > 0 and all(map(math.isfinite, result))
        return [x / result[3] for x in result[:3]]

    for i, expected in enumerate(base_rows):
        support = supports[turn + '.side' + str(i)]
        assert support['degree'] == [len(expected) - 1, 3] and support['rational'] == (i != 0)
        assert support['knots'][0] == [0] * len(expected) + [1] * len(expected) and support['knots'][1] == knots
        for j, q in enumerate(expected):
            wanted_weight = weight if i and j == 1 else 1
            assert len(support['poles'][j]) == 16
            for k, (p, w) in enumerate(zip(support['poles'][j], support['weights'][j])):
                weight_error = max(weight_error, abs(w - wanted_weight))
                assert w == support['weights'][j][0], 'U weight must be constant in V'
                wall_error = max(wall_error, distance(p, world(factors[k] * complex(*q), height * sum(knots[k + 1:k + 4]) / 3)))
        assert support['ids'][0] == curves[i]['ids'][0] and support['ids'][-1] == curves[(i + 1) % 3]['ids'][0]
        if i:
            for end in (0, 15):
                boundary, = [read for read in arc_edges.values() if read['ids'][0] == [row[end] for row in support['ids']]]
                assert boundary['knots'] == [[0, 0, 0, 1, 1, 1]]
                assert boundary['weights'] == [[row[end] for row in support['weights']]]
                for p, q in zip(boundary['poles'][0], expected):
                    cap_error = max(cap_error, distance(p, world(factors[end] * complex(*q), height * end / 15)))
            for station in range(31):
                t = station / 30
                centre = 12 * factor(t)
                for across in range(9):
                    p = evaluate_surface(support, across / 8, t)
                    x, y, z = local(p)
                    circle_error = max(circle_error, abs(abs(complex(x, y) - centre) - 3 * abs(factor(t))), abs(z - height * t))
    left, right = supports[turn + '.side1'], supports[turn + '.side2']
    for k in range(16):
        join_error = max(join_error, distance(left['poles'][-1][k], right['poles'][0][k]))
        a = [2 * weight * (x - y) for x, y in zip(left['poles'][-1][k], left['poles'][-2][k])]
        b = [2 * weight * (x - y) for x, y in zip(right['poles'][1][k], right['poles'][0][k])]
        tangent_error = max(tangent_error, distance(a, b))
    assert max(station_error, axial_error, wall_error, cap_error, circle_error, join_error, tangent_error) < 1e-8
    assert weight_error < 1e-12
    quadrature = ((-.8611363115940526, .3478548451374539), (-.3399810435848563, .6521451548625461),
                  (.3399810435848563, .6521451548625461), (.8611363115940526, .3478548451374539))
    area = 9 / 2 * (2 * math.pi / 3 - math.sin(2 * math.pi / 3))
    # Every span's squared complex magnitude has degree six; four Gauss points integrate it.
    volume = height * area * sum((b - a) / 2 * sum(w * abs(factor((a + b + (b - a) * p) / 2)) ** 2 for p, w in quadrature)
                                for a, b in zip(values, values[1:]))
    stored = None
    for exponent, measure in ((2, 'AREA_MEASURE'), (3, 'VOLUME_MEASURE')):
        item, = [fields(record) for record in entities.values() if part21.name(record) == 'MEASURE_REPRESENTATION_ITEM' and ('word', measure) in record]
        derived, = part21.refs(item[2])
        element, = part21.refs(args(derived, 'DERIVED_UNIT')[0])
        unit_args = args(element, 'DERIVED_UNIT_ELEMENT')
        assert part21.refs(unit_args[0]) == [millimetre] and numbers(unit_args[1]) == [exponent]
        if exponent == 3:
            stored, = numbers(item[1])
            assert math.isfinite(stored) and abs(stored - volume) < 1e-7
    return {'schema': schema, 'solids': {turn: (5, 9, 6)}, 'unit': 'mm', 'cubicRails': 3,
            'stationMaxErrorMM': station_error, 'smoothVolumeMM3': volume, 'signedWindingDegrees': winding,
            'rationalWalls': 2, 'quadraticCapArcs': 4, 'stations': 16, 'heightMM': height,
            'wallSupportMaxErrorMM': wall_error, 'capSupportMaxErrorMM': cap_error, 'axialMaxErrorMM': axial_error,
            'weightMaxError': weight_error, 'sectionArcRadiusMaxErrorMM': circle_error,
            'arcJoinMaxErrorMM': join_error, 'arcTangentMaxErrorMM': tangent_error,
            'supportSamples': 2 * 31 * 9, 'sectionAreaMM2': area, 'serializedVolumeMM3': stored,
            'signedAngularDerivativeCertified': True, 'minimumSignedAngularBernsteinCoefficient': angular_bound,
            'volumeErrorMM3': abs(stored - volume), 'volumeProof': 'circular-segment area times squared serialized cubic complex factor; four Gauss points per knot span'}


def line_arc_mutations(source, variant):
    """Negative controls on the concrete writer's one-record-per-line AP214 output."""
    entities, _ = part21.records(source)
    surface_id, = [ident for ident, record in entities.items()
                    if ('word', 'RATIONAL_B_SPLINE_SURFACE') in record][:1]
    curve_id, = [ident for ident, record in entities.items()
                  if ('word', 'RATIONAL_B_SPLINE_CURVE') in record][:1]

    def replace(ident, record):
        lines = [line for line in source.splitlines(keepends=True) if line.startswith('#' + str(ident) + '=')]
        assert len(lines) == 1
        return source.replace(lines[0], '#' + str(ident) + '=' + ''.join(value for _, value in record) + ';\n', 1)

    def number_changed(record, predicate, update):
        result = list(record)
        index = next(i for i, (kind, value) in enumerate(result) if kind == 'number' and predicate(float(value)))
        result[index] = ('number', str(update(float(result[index][1]))))
        return result

    parts = components(entities[surface_id])
    middle = scalar_list(members(fields(parts['B_SPLINE_SURFACE'])[2])[1], 'ref')[8]
    vector, = [ident for ident, record in entities.items() if part21.name(record) == 'VECTOR'][:1]
    face, = [ident for ident, record in entities.items() if part21.name(record) == 'ADVANCED_FACE'][:1]
    volume, = [ident for ident, record in entities.items() if ('word', 'VOLUME_MEASURE') in record]
    duplicated = [*entities[surface_id][:-1], *parts['RATIONAL_B_SPLINE_SURFACE'], ('punct', ')')]
    missing = [('punct', '('), *[token for name, body in parts.items() if name != 'RATIONAL_B_SPLINE_SURFACE' for token in body], ('punct', ')')]
    bad_weight = number_changed(parts['RATIONAL_B_SPLINE_SURFACE'], lambda x: 0 < x < 1, lambda _: .9)
    wrong_wall_weight = [('punct', '('), *[token for name, body in parts.items()
                        for token in (bad_weight if name == 'RATIONAL_B_SPLINE_SURFACE' else body)], ('punct', ')')]
    flipped = [(kind, '.F.' if (kind, value) == ('enum', '.T.') else value) for kind, value in entities[face]]
    unit = source.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT(.CENTI.,.METRE.)', 1)
    changes = {
        'duplicate-rational-component': replace(surface_id, duplicated),
        'missing-rational-component': replace(surface_id, missing),
        'wall-weight': replace(surface_id, wrong_wall_weight),
        'cap-weight': replace(curve_id, number_changed(entities[curve_id], lambda x: 0 < x < 1, lambda _: .9)),
        'middle-wall-control': replace(middle, number_changed(entities[middle], lambda _: True, lambda x: x + .25)),
        'chord-vector': replace(vector, number_changed(entities[vector], lambda _: True, lambda x: x + 1)),
        'face-orientation': replace(face, flipped),
        'length-unit': unit,
        'stored-volume': replace(volume, number_changed(entities[volume], lambda _: True, lambda x: 2 * x)),
    }
    rejected = {}
    for name, changed in changes.items():
        try:
            verify_line_arc(changed, variant)
        except (AssertionError, ValueError, KeyError, IndexError, StopIteration):
            rejected[name] = True
        else:
            raise AssertionError('negative control survived: ' + name)
    opposite = '--line-arc-screw-positive' if variant.endswith('-negative') else '--line-arc-screw-negative'
    try:
        verify_line_arc(source, opposite)
    except AssertionError:
        rejected['opposite-winding'] = True
    else:
        raise AssertionError('negative control survived: opposite-winding')
    return {'detected': len(rejected), 'results': rejected, 'productImports': 0}


def verify(source, variant=None):
    if variant in ('--line-arc-screw-positive', '--line-arc-screw-negative'):
        return verify_line_arc(source, variant)
    triangular_screw = variant in ('--triangular-screw-positive', '--triangular-screw-negative')
    rectangular_screw = variant in ('--screw-positive', '--screw-negative')
    polygon_corners = {
        'trapezoid': [(-8, -5), (2, -5), (0, -1), (-7, -1)],
        'skew-quadrilateral': [(-7, -4), (2, -3), (0, -1), (-5, 1)],
        'pentagon': [(-7, -4), (2, -3), (1, -1), (-4, 1), (-6, -1)],
        'hexagon': [(-7, -5), (1, -5), (3, -3), (2, -1), (-3, 1), (-7, -1)],
    }
    polygon = polygon_corners.get(variant[2:].split('-screw-', 1)[0]) if variant else None
    if triangular_screw or polygon:
        corners = polygon or [(-7, -4), (2, -3), (-4, 1)]
        n = len(corners)
        turn, expected_counts = 'n18', {'n18': (n + 2, 3 * n, 2 * n)}
        angle = 450 if variant.endswith('-positive') else -450
        stations, height, cohort_volume = 16, 50, 0
        origin, axis_v, axis_w = (21, -19.4, 24.8), (0, 0.8, -0.6), (0, 0.6, 0.8)
    elif rectangular_screw:
        turn, expected_counts = 'n18', {'n18': (6, 12, 8)}
        corners = [(2, 1), (14, 1), (14, 9), (2, 9)]
        angle = 360 if variant == '--screw-positive' else -360
        stations, height, cohort_volume = 16, 56, 0
        origin, axis_v, axis_w = (10, -16, 3), (0, 1, 0), (0, 0, 1)
    elif variant == '--triangle':
        turn, expected_counts = 'n17', {'n17': (5, 9, 6)}
        corners = [(-4, -2), (5, -1), (-1, 3)]
        stations, angle, height, cohort_volume = 16, -450, 50, 0
        origin, axis_v, axis_w = (18, -21, 26), (0, 0.8, -0.6), (0, 0.6, 0.8)
    else:
        turn, expected_counts = 'n21', {'n7': (18, 36, 20), 'n21': (6, 12, 8)}
        corners = [(-10, -4), (10, -4), (10, 4), (-10, 4)]
        stations, angle, height, cohort_volume = 13, 360, 40, 2560
        origin, axis_v, axis_w = (47, -11, 3), (0, 1, 0), (0, 0, 1)
    sides = len(corners)
    multiplicity = [4] + [1] * (stations - 4) + [4]

    def projected(p, axis):
        return sum((value - origin[i]) * axis[i] for i, value in enumerate(p))

    def station_point(x, y, t):
        phase = math.radians(angle) * t
        c, s = math.cos(phase), math.sin(phase)
        return [origin[0] + c * x - s * y,
                *[origin[i] + (s * x + c * y) * axis_v[i] + height * t * axis_w[i] for i in (1, 2)]]

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
    assert len(solid_ids) == len(expected_counts) and set(solid_ids) <= set(part21.refs(shape[1]))
    solids = {label(of_kind(ident, 'MANIFOLD_SOLID_BREP')[0]): part21.refs(of_kind(ident, 'MANIFOLD_SOLID_BREP')[1])[0]
              for ident in solid_ids}
    assert set(solids) == set(expected_counts)
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
            assert len(oriented) == (sides if solid == turn and name in {turn + ".bottom", turn + ".top"} else 4)
            ends = []
            for use in oriented:
                args = of_kind(use, 'ORIENTED_EDGE')
                edge, = part21.refs(args[3])
                sense, = args[4]
                a, b, curve = part21.refs(entities[edge])
                vertices.update((a, b))
                uses[edge].append(sense)
                ends.append((a, b) if sense == ('enum', '.T.') else (b, a))
                if solid == turn and part21.name(entities[curve]) == 'B_SPLINE_CURVE_WITH_KNOTS':
                    rails[edge] = (vertex(a), vertex(b), of_kind(curve, 'B_SPLINE_CURVE_WITH_KNOTS'))
            assert all(pair[1] == ends[(i + 1) % len(ends)][0] for i, pair in enumerate(ends))
            if solid == turn and name.startswith(turn + '.side'):
                surface, = part21.refs(face_fields[2])
                supports[int(name.removeprefix(turn + '.side'))] = of_kind(surface, 'B_SPLINE_SURFACE_WITH_KNOTS')
            elif solid == turn:
                assert name in {turn + '.bottom', turn + '.top'}
                surface, = part21.refs(face_fields[2])
                of_kind(surface, 'PLANE')
        assert (len(faces), len(uses), len(vertices)) == expected_counts[solid]
        assert all(sorted(orientation) == [('enum', '.F.'), ('enum', '.T.')] for orientation in uses.values())

    assert len(rails) == len(supports) == sides
    curves, max_error, signed_turns = [], 0, []
    for x, y in corners:
        start = station_point(x, y, 0)
        a, b, args = next(rail for rail in rails.values() if distance(rail[0], start) < 1e-8)
        assert distance(b, station_point(x, y, 1)) < 1e-8
        assert numbers(args[1]) == [3]
        pole_ids = part21.refs(args[2])
        multiplicities, values = list(map(int, numbers(args[6]))), numbers(args[7])
        assert len(pole_ids) == stations and multiplicities == multiplicity
        assert len(values) == len(multiplicities) and values[0] == 0 and values[-1] == 1
        assert all(x1 > x0 for x0, x1 in zip(values, values[1:]))
        knots = [value for value, n in zip(values, multiplicities) for _ in range(n)]
        poles = list(map(point, pole_ids))
        assert poles[0] == a and poles[-1] == b
        for i, pole in enumerate(poles):
            # Cubic Greville coefficients reproduce the linear axial coordinate.
            assert abs(projected(pole, axis_w) - height * sum(knots[i + 1:i + 4]) / 3) < 1e-8
        for station in range(stations):
            t = station / (stations - 1)
            expected = station_point(x, y, t)
            max_error = max(max_error, distance(cubic(poles, knots, t), expected))
        if rectangular_screw or triangular_screw or polygon:
            # Recover the sign and total turn from the actual serialized curve.
            # Endpoints alone coincide in the sketch plane after a revolution.
            samples = [cubic(poles, knots, i / 240) for i in range(241)]
            xy = [(p[0] - origin[0], projected(p, axis_v)) for p in samples]
            angles = [math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])
                      for a, b in zip(xy, xy[1:])]
            assert all(angle * step > 0 for step in angles)
            total = math.degrees(sum(angles))
            assert abs(total - angle) < 1e-8
            signed_turns.append(total)
        curves.append((poles, knots, pole_ids, values))
    assert max_error < 1e-8
    for i, surface in supports.items():
        first, second = curves[i], curves[(i + 1) % sides]
        assert numbers(surface[1]) == [1] and numbers(surface[2]) == [3]
        assert part21.refs(surface[3]) == first[2] + second[2]
        assert numbers(surface[8]) == [2, 2] and numbers(surface[9]) == multiplicity
        assert numbers(surface[10]) == [0, 1] and numbers(surface[11]) == first[3] == second[3]

    def area(t):
        points = [cubic(poles, knots, t) for poles, knots, _, _ in curves]
        xy = [(p[0] - origin[0], projected(p, axis_v)) for p in points]
        return sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(xy, xy[1:] + xy[:1])) / 2

    # In each knot span the polygon area is a polynomial of degree at most six.
    weights = ((-0.8611363115940526, 0.3478548451374539), (-0.3399810435848563, 0.6521451548625461),
               (0.3399810435848563, 0.6521451548625461), (0.8611363115940526, 0.3478548451374539))
    values = curves[0][3]
    volume = height * sum((b - a) / 2 * sum(w * area((a + b + (b - a) * p) / 2) for p, w in weights)
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
            assert abs(stored - (volume + cohort_volume)) < 1e-7
    return {'schema': schema, 'solids': expected_counts, 'unit': 'mm', 'cubicRails': len(rails),
            'stationMaxErrorMM': max_error, 'smoothVolumeMM3': volume, 'signedWindingDegrees': signed_turns}


if __name__ == '__main__':
    options = sys.argv[2:]
    selftest = '--selftest' in options
    options = [option for option in options if option != '--selftest']
    variants = {'--triangle', '--screw-positive', '--screw-negative',
                '--line-arc-screw-positive', '--line-arc-screw-negative',
                '--triangular-screw-positive', '--triangular-screw-negative',
                '--pentagon-screw-positive', '--pentagon-screw-negative',
                '--hexagon-screw-positive', '--hexagon-screw-negative',
                '--trapezoid-screw-positive', '--trapezoid-screw-negative',
                '--skew-quadrilateral-screw-positive', '--skew-quadrilateral-screw-negative'}
    assert len(options) <= 1 and all(option in variants for option in options)
    source, variant = Path(sys.argv[1]).read_text(encoding='utf-8'), options[0] if options else None
    result = verify(source, variant)
    if selftest:
        assert variant in ('--line-arc-screw-positive', '--line-arc-screw-negative')
        result['mutationControls'] = line_arc_mutations(source, variant)
    print(json.dumps(result))
