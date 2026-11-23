"""Check explicitly assigned cone fixture units independently of the CAD importer."""
import importlib.util
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('offset_reader', Path(__file__).with_name('step-offset-oracle.py'))
offset_reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offset_reader)
p21 = offset_reader.graph
spec = importlib.util.spec_from_file_location('spline_reader', Path(__file__).with_name('smooth-turn-step-oracle.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def read(path, angle, degrees, wrapped):
    entities, schema = p21.records(Path(path).read_text())
    assert len(schema) == 1 and schema[0].startswith('AUTOMOTIVE_DESIGN')
    assert all(target in entities for record in entities.values() for target in p21.refs(record))

    def fields(ident, kind):
        assert p21.name(entities[ident]) == kind
        return reader.fields(entities[ident])

    def first(arg):
        ident, = p21.refs(arg)
        return ident

    shape, = [ident for ident, record in entities.items() if p21.name(record) == 'ADVANCED_BREP_SHAPE_REPRESENTATION']
    rep = fields(shape, 'ADVANCED_BREP_SHAPE_REPRESENTATION')
    solid, context = first(rep[1]), first(rep[2])
    shell = first(fields(solid, 'MANIFOLD_SOLID_BREP')[1])
    faces = p21.refs(fields(shell, 'CLOSED_SHELL')[1])
    assert len(faces) == 3
    surfaces = [first(fields(face, 'ADVANCED_FACE')[2]) for face in faces]
    cone, = [ident for ident in surfaces if p21.name(entities[ident]) != 'PLANE']
    if wrapped:
        args = fields(cone, 'OFFSET_SURFACE')
        assert reader.numbers(args[2]) == [0]
        cone = first(args[1])
    raw, = reader.numbers(fields(cone, 'CONICAL_SURFACE')[3])
    unit_context = reader.components(entities[context])['GLOBAL_UNIT_ASSIGNED_CONTEXT']
    units = [reader.components(entities[ref]) for ref in p21.refs(reader.fields(unit_context)[0])]
    length, = [parts for parts in units if 'LENGTH_UNIT' in parts]
    assert reader.fields(length['SI_UNIT']) == [[('enum', '.MILLI.')], [('enum', '.METRE.')]]
    angle_unit, = [parts for parts in units if 'PLANE_ANGLE_UNIT' in parts]
    factor = 1
    if degrees:
        label, conversion = reader.fields(angle_unit['CONVERSION_BASED_UNIT'])
        assert reader.label(label) == 'DEGREE'
        measure = reader.components(entities[first(conversion)])
        scalar, unit = reader.fields(measure['MEASURE_WITH_UNIT'])
        assert ('word', 'PLANE_ANGLE_MEASURE') in scalar
        factor, = reader.numbers(scalar)
        assert factor == math.pi / 180
        angle_unit = reader.components(entities[first(unit)])
        assert raw == angle
    assert 'PLANE_ANGLE_UNIT' in angle_unit
    assert reader.fields(angle_unit['SI_UNIT']) == [[('punct', '$')], [('enum', '.RADIAN.')]]
    assert abs(raw * factor - math.radians(angle)) < 1e-15
    return {'degrees': degrees, 'wrapped': wrapped, 'referenceDegrees': angle, 'raw': raw,
            'factorToRadians': factor, 'slope': math.tan(raw * factor)}


if __name__ == '__main__':
    folder = Path(sys.argv[1])
    cases = [read(folder / f'{unit}-{angle}-{route}.step', angle, unit == 'degree', route == 'offset')
             for angle in (1, 30) for route in ('direct', 'offset') for unit in ('radian', 'degree')]
    print(json.dumps({'status': 'PASS', 'cases': cases}))
