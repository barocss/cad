# Cage selection, mirror disclosure and no-op history (#37)

- Weld near now explains its prerequisite (at least two selected vertices, including vertices from picked edges/faces). The blocked control remains focusable for its explanation; the model also refuses missing selection before attempting proximity welding. A valid selection outside tolerance retains the kernel's distinct proximity failure.
- Mirror's panel explains before selection that the positive axis side is kept and the negative side replaced, that plane vertices stay constrained, and how Cage Undo/Cancel recover.
- A non-extruding drag whose resulting positions are unchanged returns the identical session. In particular, dragging a mirror-plane vertex along the constrained axis no longer adds Undo or clears Redo. Real tangential edits still add one step.

Validation:
- New model tests 2/2; existing cageEdit tests 7/7 pass, including valid kernel mirrored bodies, off-plane edits/extrusion and mirror-off.
- Changed product-file lint and Studio typecheck/build pass.
- Frozen Chrome WebGPU at 1024 and 1440: no-selection Weld near prerequisite and no mutation, mirror-source text, a real moveX gizmo drag on a selected X=0 vertex with unchanged cage/Undo, Cage Undo/Redo, Done, document Undo/Redo and Save/Open pass.
- Browser artifact `/tmp/cad-mirror-noop-20261116`; constrained-drag-1024 screenshot visually reviewed.

Limits: one SubD box family, not all cage topologies, assistive technologies or WebGL2. No automatic symmetry conflict resolution added. Protected #126 WIP unchanged and excluded from commit.
