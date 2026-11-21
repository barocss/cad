"""Read the saved Screw at the measured Model camera and compare three display meshes."""
from bisect import bisect_right
import json
import math
from pathlib import Path
import sys


def difference(a, b):
    return tuple(x - y for x, y in zip(a, b))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def unit(a):
    size = math.hypot(*a)
    return tuple(x / size for x in a)


def triples(flat):
    return [flat[i:i + 3] for i in range(0, len(flat), 3)]


def cubic(poles, knots, t):
    if t == 1:
        return poles[-1]
    span = bisect_right(knots, t) - 1
    work = poles[span - 3:span + 1]
    for order in (1, 2, 3):
        for j in reversed(range(order, 4)):
            i = span - 3 + j
            weight = (t - knots[i]) / (knots[i + 4 - order] - knots[i])
            work[j] = tuple((1 - weight) * a + weight * b for a, b in zip(work[j - 1], work[j]))
    return work[-1]


def structured(mesh, faces, walls, across=2, along=96):
    positions, indices, owners = [], [], []
    original_indices = triples(mesh['indices'])
    for owner, face in enumerate(mesh['faces']):
        if face not in walls:
            mapped = {}
            for tri in original_indices:
                if mesh['owners'][tri[0]] != owner:
                    continue
                for j in tri:
                    if j not in mapped:
                        mapped[j] = len(owners)
                        positions.extend(mesh['positions'][3 * j:3 * j + 3])
                        owners.append(owner)
                    indices.append(mapped[j])
            continue
        surface = faces[face]
        rows, knots = surface['controlPoints'], surface['knotsV']
        start = len(owners)
        stations = sorted(set([i / along for i in range(along + 1)] + knots))
        for t in stations:
            a, b = (cubic(row, knots, t) for row in rows)
            for i in range(across + 1):
                u = i / across
                positions.extend((1 - u) * p + u * q for p, q in zip(a, b))
                owners.append(owner)
        for j in range(len(stations) - 1):
            for i in range(across):
                a = start + j * (across + 1) + i
                b, c, d = a + 1, a + across + 1, a + across + 2
                indices.extend((a, b, c, b, d, c))
    return {'positions': positions, 'indices': indices, 'owners': owners, 'faces': mesh['faces']}


def projected_hits(triangles, x, y):
    hits = []
    for face, a, b, c, x0, x1, y0, y1 in triangles:
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            continue
        ax, ay = a[0] - c[0], a[1] - c[1]
        bx, by = b[0] - c[0], b[1] - c[1]
        rx, ry = x - c[0], y - c[1]
        determinant = ax * by - bx * ay
        if determinant == 0:
            continue
        wa, wb = (rx * by - bx * ry) / determinant, (ax * ry - rx * ay) / determinant
        wc = 1 - wa - wb
        if min(wa, wb, wc) >= -1e-12:
            hits.append((1 / (wa / a[2] + wb / b[2] + wc / c[2]), face))
    return hits


def depth_summary(results, kind):
    same, wrong, missing, errors = 0, 0, 0, []
    for result in results:
        native, display = result['native'], result[kind]
        if native and display:
            if native[1] == display[1]:
                same += 1
                errors.append(abs(native[0] - display[0]))
            else:
                wrong += 1
        elif bool(native) != bool(display):
            missing += 1
    return {
        'sameFace': same, 'wrongFace': wrong, 'missingOrSpurious': missing,
        'medianDepthMM': sorted(errors)[len(errors) // 2] if errors else None,
        'maxDepthMM': max(errors, default=None),
    }


def measure(geometry, view):
    eye, camera, canvas = view['eye'], view['camera'], view['canvas']
    assert not camera['ortho'] and view['devicePixelRatio'] == 1
    forward = unit(difference(camera['target'], eye))
    right = unit(cross(forward, (0, 0, 1)))
    up = cross(right, forward)
    zoom = math.tan(camera['fovY'] / 2)
    aspect = canvas['width'] / canvas['height']

    def camera_point(p):
        v = difference(p, eye)
        return dot(v, right), dot(v, up), dot(v, forward)

    def screen(p):
        x, y, z = camera_point(p)
        assert z > 0
        return (canvas['left'] + canvas['width'] * (1 + x / (z * zoom * aspect)) / 2,
                canvas['top'] + canvas['height'] * (1 - y / (z * zoom)) / 2, z)

    faces = {face['id']: face['surface'] for face in geometry['faces']}
    walls = {face: ([list(map(camera_point, row)) for row in s['controlPoints']], s['knotsV'])
             for face, s in faces.items() if s['degreeV'] == 3}
    assert len(walls) == 4
    meshes = geometry['meshes']
    meshes['structured'] = structured(meshes['q24'], faces, walls)
    triangles = {}
    for kind, mesh in meshes.items():
        projected = [screen(p) for p in triples(mesh['positions'])]
        out = []
        for i, j, k in triples(mesh['indices']):
            a, b, c = projected[i], projected[j], projected[k]
            owner = mesh['owners'][i]
            assert mesh['owners'][j] == mesh['owners'][k] == owner
            face = mesh['faces'][owner]
            out.append((face, a, b, c, min(a[0], b[0], c[0]), max(a[0], b[0], c[0]),
                        min(a[1], b[1], c[1]), max(a[1], b[1], c[1])))
        triangles[kind] = out
    # The planar caps are triangulated on the exact plane with their straight trimmed rims.
    caps = [tri for tri in triangles['q24'] if tri[0] not in walls]

    def sample(n):
        return {face: [(cubic(rows[0], knots, i / n), cubic(rows[1], knots, i / n)) for i in range(n + 1)]
                for face, (rows, knots) in walls.items()}

    def native_hits(x, y, samples, count):
        sx = (2 * (x - canvas['left']) / canvas['width'] - 1) * zoom * aspect
        sy = (1 - 2 * (y - canvas['top']) / canvas['height']) * zoom
        hits = projected_hits(caps, x, y)

        def transverse(p):
            return p[0] - sx * p[2], p[1] - sy * p[2]

        def determinant(a, b):
            x0, y0 = transverse(a)
            x1, y1 = transverse(b)
            return x0 * y1 - y0 * x1

        for face, (rows, knots) in walls.items():
            pairs = samples[face]
            previous = determinant(*pairs[0])
            for i in range(1, count + 1):
                current = determinant(*pairs[i])
                if previous * current < 0:
                    lo, hi = (i - 1) / count, i / count
                    negative = previous < 0
                    for _ in range(35):
                        t = (lo + hi) / 2
                        left, right = (cubic(row, knots, t) for row in rows)
                        if (determinant(left, right) < 0) == negative:
                            lo = t
                        else:
                            hi = t
                    a, b = transverse(left), transverse(right)
                    direction = difference(b, a)
                    u = -dot(a, direction) / dot(direction, direction)
                    if 0 <= u <= 1:
                        hits.append((left[2] + u * (right[2] - left[2]), face))
                previous = current
        return sorted(hits)

    stats = []
    coarse, fine = sample(2048), sample(4096)
    for region in [(794, 369, 35, 19), (711, 685, 44, 23)]:
        x, y, w, h = region
        results, rays = [], 0
        for py in range(y, y + h, 2):
            for px in range(x, x + w, 2):
                rays += 1
                pixel = px + .5, py + .5
                first = native_hits(*pixel, coarse, 2048)
                second = native_hits(*pixel, fine, 4096)
                if len(first) != len(second) or any(
                    a[1] != b[1] or abs(a[0] - b[0]) >= 1e-8 for a, b in zip(first, second)
                ):
                    continue
                result = {'native': second[0] if second else None}
                for kind, mesh in triangles.items():
                    result[kind] = min(projected_hits(mesh, *pixel), default=None)
                results.append(result)
        stat = {
            'region': region, 'rays': rays, 'bracketAgreement': len(results),
            **{kind: {'triangles': len(mesh), **depth_summary(results, kind)} for kind, mesh in triangles.items()},
        }
        assert len(results) == rays
        assert stat['q24']['maxDepthMM'] > 9 and stat['q48']['maxDepthMM'] > 9
        assert stat['structured']['maxDepthMM'] < .75
        assert stat['structured']['missingOrSpurious'] == stat['structured']['wrongFace'] == 0
        stats.append(stat)

    interior = {}
    for kind, mesh in meshes.items():
        counts = {face: [0, 0] for face in walls}
        for i, p in enumerate(triples(mesh['positions'])):
            face = mesh['faces'][mesh['owners'][i]]
            if face not in walls:
                continue
            surface = faces[face]
            t = min(1, max(0, (p[2] - 3) / 50))
            a, b = (cubic(row, surface['knotsV'], t) for row in surface['controlPoints'])
            side = difference(b, a)
            u = dot(difference(p, a), side) / dot(side, side)
            counts[face][0] += 1
            if 1e-7 < u < 1 - 1e-7 and 1e-7 < t < 1 - 1e-7:
                counts[face][1] += 1
        interior[kind] = counts
    assert all(c[1] == 0 for kind in ('q24', 'q48') for c in interior[kind].values())
    return {'regions': stats, 'sidePointsAndInterior': interior}


if __name__ == '__main__':
    root = Path(sys.argv[1])
    solid = json.loads((root / 'geometry.stdout.json').read_text())
    camera_view = json.loads((root / 'view.json').read_text())
    print(json.dumps(measure(solid, camera_view)))
