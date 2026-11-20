# Flat pattern SVG: outward obround caps after Undo

Follow-up for #27, original checklist row 1427. Actual desktop Chrome/WebGPU with the same reconstructed synthetic 55 × 20 mm plate (two R10 caps). Baseline: `7d1c5c26602b6aaa36e98903f628661245d9def0`. SVG repair: `7280566f7b642b8d2e1940e8bc85ff685b54f3ba`.

| SVG point after Undo (mm) | Before | After |
| --- | --- | --- |
| Left / right cap interior (2,10) / (53,10) | Outside / outside | Inside / inside |
| Center (27.5,10) | Inside | Inside |
| Dry corners (2,2) / (53,2) | Outside / outside | Outside / outside |

[Before: concave caps](01-before-concave-caps.png) · [After: outward caps](02-after-outward-caps.png)

The native Undo result was identical in both runs: 55 × 20 mm bounds, 1014.159265 mm² contour with the same two outward native arcs, and original document unchanged. Native positive rectangular control still produced a flat with one bend. The same browser flow also verified curved-edge refusal and the pre-Apply straight-edge advisory. Focused SVG tests: 3/3. No change to native machining geometry or DXF, no export/download, and no manufacturing qualification. This is a reconstructed fixture, not the recovered historical document.
