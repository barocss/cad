"""Independent authored-anchor oracle for the historical five-edge R20/R5 repair.

stdin: {source: original document, doc: repaired document, native: {volume: ...}}
No product imports. Ideal (0,20) comparison is diagnostic, not the authored oracle.
"""
import json
import math
import sys

VOLUME_TOLERANCE = 1e-7
POINT_TOLERANCE = 1e-8


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def analytic(anchor, end, source_radius, radius, height):
    center = [end[0], end[1] - source_radius]
    dy = anchor[1] + radius - center[1]
    inner = source_radius - radius
    assert inner > abs(dy), 'No interior tangent branch'
    dx = math.sqrt(inner * inner - dy * dy)
    angle = math.atan2(dy, dx)
    fillet = [center[0] + dx, anchor[1] + radius]
    line_touch = [fillet[0], anchor[1]]
    arc_touch = [center[0] + source_radius * dx / inner,
                 center[1] + source_radius * dy / inner]
    points = [anchor, line_touch, arc_touch, end, [anchor[0], end[1]]]
    area = sum(cross(p, points[(i + 1) % 5]) for i, p in enumerate(points)) / 2
    for r, sweep in [(radius, math.pi / 2 + angle), (source_radius, math.pi / 2 - angle)]:
        area += r * r * (sweep - math.sin(sweep)) / 2
    # Persisted outline traverses the same boundary clockwise.
    return {'volume': area * height, 'points': [points[i] for i in [0, 4, 3, 2, 1]],
            'sourceCenter': center, 'roundCenter': fillet}


def green_volume(outline, height):
    points, bulges = outline['points'], outline['bulges']
    assert len(points) == len(bulges) == 5
    area = sum(cross(p, points[(i + 1) % 5]) for i, p in enumerate(points)) / 2
    for i, bulge in enumerate(bulges):
        if bulge != 0:
            chord = math.dist(points[i], points[(i + 1) % 5])
            radius = chord * (1 + bulge * bulge) / (4 * abs(bulge))
            sweep = 4 * math.atan(bulge)
            area += radius * radius * (sweep - math.sin(sweep)) / 2
    return abs(area) * height


def main(payload):
    source, doc, native = payload['source'], payload['doc'], payload['native']
    old, repaired = source['nodes'][0], doc['nodes'][0]
    before, after = old['outline'], repaired['outline']
    assert len(source['nodes']) == len(doc['nodes']) == 2
    assert old['kind'] == repaired['kind'] == 'sketch'
    assert old['profile'] == repaired['profile'] == 'loop'
    assert source['nodes'][1]['kind'] == 'extrude' and source['nodes'][1]['height'] == 10
    assert doc['nodes'][1:] == source['nodes'][1:]
    assert doc['outputs'] == source['outputs']
    assert repaired['sideTags'] == old['sideTags']
    assert before['radii'] == {'2': 20, '3': 10}
    assert after['radii'] == {'2': 20, '3': 5}
    assert before['rules'] == after['rules'] == [{'kind': 'fix', 'point': 2, 'at': [20, 40]}]
    assert before['hv'] == after['hv'] == {'h': [1, 4], 'v': [0]}
    assert before['tangents'] == after['tangents'] == [2, 3, 4]
    height = doc['nodes'][1]['height']
    anchor = before['points'][0]
    end = before['rules'][0]['at']
    authored = analytic(anchor, end, after['radii']['2'], after['radii']['3'], height)
    ideal = analytic([0, 20], end, 20, 5, height)
    volume = native['volume']
    integral = green_volume(after, height)
    errors = [math.dist(actual, expected) for actual, expected in zip(after['points'], authored['points'])]
    result = {'authored': authored, 'nativeVolume': volume, 'greenVolume': integral,
              'pointErrors': errors, 'maxPointError': max(errors),
              'nativeMinusAuthored': volume - authored['volume'],
              'nativeMinusGreen': volume - integral,
              'authoredMinusIdeal': authored['volume'] - ideal['volume'],
              'idealVolume': ideal['volume'], 'idealGap': abs(volume - ideal['volume']),
              'idealAccuracy': 'PASS' if abs(volume - ideal['volume']) <= VOLUME_TOLERANCE else 'FAIL',
              'volumeTolerance': VOLUME_TOLERANCE, 'pointTolerance': POINT_TOLERANCE}
    assert all(math.isfinite(v) for v in [volume, integral, authored['volume'], *errors])
    assert abs(volume - authored['volume']) <= VOLUME_TOLERANCE, result
    assert abs(volume - integral) <= VOLUME_TOLERANCE, result
    assert max(errors) <= POINT_TOLERANCE, result
    result['authoredAccuracy'] = 'PASS'
    result['status'] = 'PASS'  # Authored-coordinate contract only; idealAccuracy remains separate.
    return result


if __name__ == '__main__':
    print(json.dumps(main(json.load(sys.stdin)), indent=2, allow_nan=False))
