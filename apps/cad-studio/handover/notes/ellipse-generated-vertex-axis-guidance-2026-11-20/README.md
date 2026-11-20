# Generated ellipse vertices: guide to the existing axis editor

Focused #21 Chrome/WebGPU evidence. Baseline `efc1f66a69ca381373be5168d763126d1e3abddf`; product `f2b4c1d90d87bb61e7608036a783dda40c4b7791`. In the synthetic rotated ellipse (Rx 50 mm, Ry 20 mm), the two opposite generated X-axis vertices previously opened a generic 100 mm point-distance field. Entering 101 mm hit the solver's 64-point/segment budget rather than editing an ellipse axis.

After the change, actual physical picks on either of those generated vertices show “Edit Rx or Ry in the Ellipse section” and route to the existing axis fields, without opening a generic point-distance draft. The existing workflow then edited Rx to 54 mm, finished the sketch and qualified the native result independently; Undo and Redo preserved the expected shape. No solver, native geometry, schema, or general ellipse constraint support was added. The focused reducer tests also cover ordinary polygon, circle, Select and unsupported metadata cases. No downloads or source changes during either run.

[Before: generic solver budget error](01-before-generic-solver-budget.png) · [After: existing Rx/Ry guidance](02-after-owned-axis-guidance.png)
