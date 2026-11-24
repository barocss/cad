"""Check original Studio SVG and DXF bytes. No imports from the CAD product."""
import json
import math
import sys
import xml.etree.ElementTree as ET

import ezdxf


VALUES = {"vertical": 10, "aligned": math.hypot(64, 10)}


def close(actual, expected, tolerance=1e-6):
    assert abs(actual - expected) <= tolerance, (actual, expected)


def format_marks(group):
    return [(item.tag.rsplit("}", 1)[-1], dict(item.attrib), item.text or "") for item in group]


def svg_line(mark, height):
    name, attr, _ = mark
    if name == "line":
        return [(float(attr["x1"]), height - float(attr["y1"])),
                (float(attr["x2"]), height - float(attr["y2"]))]


def extension_role(line, points, along, tolerance):
    if not line:
        return None
    start, end = line
    projection = lambda a, b: (a[0] - b[0]) * along[0] + (a[1] - b[1]) * along[1]
    if math.hypot(end[0] - start[0], end[1] - start[1]) <= tolerance or abs(projection(end, start)) > tolerance:
        return None
    return next((role for role, point in zip(("a", "b"), points)
                 if abs(projection(start, point)) <= tolerance), None)


def dxf_roles(dimension, points, along):
    return sorted(role for line in dimension.get_geometry_block().query("LINE")
                  if (role := extension_role((line.dxf.start, line.dxf.end), points, along, 1e-6)))


results, marks_by_label = [], {}
for case in json.load(sys.stdin)["files"]:
    label = case["label"]
    root = ET.parse(case["svg"]).getroot()
    groups = {child.get("data-dim"): format_marks(child) for child in root.iter()
              if child.get("class") == "dimension"}
    assert set(groups) == set(VALUES), (label, groups.keys())
    height = float(root.get("viewBox").split()[3])
    for ident, group in groups.items():
        assert group == format_marks(ET.fromstring("<g>" + case["screen"][ident] + "</g>")), (label, ident)
    base_marks = {}
    for version, path in case["formats"].items():
        doc = ezdxf.readfile(path)
        assert doc.dxfversion == version
        audit = doc.audit()
        assert not audit.errors and not audit.fixes, (version, audit.errors, audit.fixes)
        dimensions = {dim.dimtype: dim for dim in doc.modelspace().query("DIMENSION")}
        assert set(dimensions) == {0, 1} and len(doc.modelspace().query("DIMENSION")) == 2
        for ident, dimension in zip(VALUES, (dimensions[0], dimensions[1])):
            hidden = case["hidden"][ident]
            points = (dimension.dxf.defpoint2, dimension.dxf.defpoint3)
            vector = points[1] - points[0]
            if ident == "vertical":
                close(dimension.dxf.angle, 90)
                close(vector.x, 64)
                close(vector.y, 10)
                angle = math.pi / 2
            else:
                close(vector.x, -64)
                close(vector.y, -10)
                angle = math.atan2(vector.y, vector.x)
            along = math.cos(angle), math.sin(angle)
            close(dimension.get_measurement(), VALUES[ident])
            if version == "AC1015":
                close(dimension.dxf.actual_measurement, VALUES[ident])
            expected_roles = case["roles"][ident]
            classified = [(extension_role(svg_line(mark, height), points, along, .001), mark)
                          for mark in groups[ident]]
            svg_roles = sorted(role for role, _ in classified if role)
            assert svg_roles == dxf_roles(dimension, points, along) == expected_roles, (label, ident, version, svg_roles)
            base_marks[ident] = [mark for role, mark in classified if not role]
            style = dimension.override()
            assert (style.get("dimse1", 0), style.get("dimse2", 0)) == (int(hidden == "a"), int(hidden == "b"))
            # The aligned DXF derives its angle from the two ordered points. ezdxf's rendering
            # entry point uses a separate angle input for both aligned and rotated entities.
            nominal_text = dimension.dxf.text
            if dimension.dimtype == 1:
                dimension.dxf.angle = math.degrees(angle)
            style.render()
            regenerated = dxf_roles(dimension, points, along)
            assert regenerated == [role for role in ("a", "b") if role != hidden], (label, ident, version, regenerated)
            assert points == (dimension.dxf.defpoint2, dimension.dxf.defpoint3)
            assert dimension.dxf.text == nominal_text
            results.append({"label": label, "version": version, "id": ident, "hidden": hidden,
                            "measurement": dimension.get_measurement(), "stored": svg_roles, "regenerated": regenerated})
    marks_by_label[label] = groups, base_marks

first, first_base = marks_by_label["01-original-short-a"]
moved, moved_base = marks_by_label["03-moved-a-reappears"]
for label, (groups, base) in marks_by_label.items():
    assert base["aligned"] == first_base["aligned"], label
    if not label.startswith(("06", "07", "09")):
        assert groups["aligned"] == first["aligned"], label
    if label.startswith(("01", "02")):
        assert base["vertical"] == first_base["vertical"], label
    else:
        assert base["vertical"] == moved_base["vertical"], label
assert marks_by_label["07-aligned-hide-b"] == marks_by_label["09-reopened-role-b"]
assert marks_by_label["05-vertical-hide-a"] == marks_by_label["10-restore-both-after-open"]
print(json.dumps({"status": "PASS", "reader": ezdxf.__version__, "dimensions": results}))
