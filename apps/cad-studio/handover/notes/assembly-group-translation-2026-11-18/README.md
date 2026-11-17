# Static free-part group translation (#643)

Base `2831119f9` / #642. Existing placed-part gizmos and position fields are single-selection. This additive workflow uses the actual Ctrl/Cmd outliner multi-selection to move ordinary free parts by an explicit shared world XYZ offset (mm), preserving occurrence identities, rotations, shared definitions and relative placement. Apply is one undoable accepted-document commit. It is not a generic group Transform or solver extension.

All selected IDs and results are preflighted before any mutation. Missing/nested/duplicate identity, fixed/hidden, pattern seed or occurrence, either mate endpoint (including a nested endpoint's host), posed/jointed/subassembly targets and selected world-frame assembly-cut targets refuse wholly. Any active linked bearing housing in the assembly refuses conservatively: an unselected owner can depend on the selected target's world pose. Suppressed housing nodes do not block. Unrelated cut targets remain unchanged and do not block.

Finite inputs/results alone are insufficient: nonzero coordinate offsets lost to numeric resolution and relative-position collapse under huge finite offsets also refuse. Relative preservation uses an absolute 1e-9 mm / relative 1e-12 numeric preflight, not a manufacturing tolerance or precision certification. Zero deltas create no history.

The UI requires current evaluated master Model, current instance faces and no mate problems. Posed, exploded, section, isolation, step, cut, variant/history or in-place contexts are not group-move authoring contexts. The exact document/selection/context owns each unapplied offset; owner change or Escape resets it. The existing current-document acceptance guard is rechecked before committing. No schema, solver, geometry generation, Motion, manufacturing or HOLD change.

## Verification

- Focused unit **6/6 PASS**: relative positions, identity and no-op; whole-batch refusal for missing/nested/fixed/hidden/pattern/pose; either mate endpoint; selected/unselected cuts; finite/overflow/lost-offset/huge-relative-collapse; unselected linked housing and suppressed exception; nested host and duplicate identity.
- Actual Chrome **run01 PASS**, then **run02 PASS** after the relative-collapse preflight was added. Each moves two blocks by `[12,-7,5]` mm with unchanged rotation/definition/nonselected parts, and independently compares every actual evaluated placed bounding-box min/max to its original plus that offset. Document nodes and mates unchanged.
- Actual one-step Undo/Redo; native Save and fresh-context Open retain the exact moved document. Infinity input disables Apply. Selection replacement and Escape retire the draft. A mixed fixed/free selection refuses with the exact whole document unchanged.
- Existing #642 actual grounding regression **PASS** on the new panel before the final translation-only numeric preflight: Fix/Unfix, history, selection, native file and mixed mate refusal. The grounding code was not changed.
- All three source-frozen capsules equal after-cleanup. Offset/moved/refusal images visually inspected; inputs, two selected rows, highlighted blocks and refusal explanation are readable.
- Studio types and scoped ESLint including App pass; no failed browser attempt is hidden or fabricated.

## Boundaries

The browser uses synthetic simple support blocks, not customer geometry. Mate/pattern/cut/housing/nested/pose/numeric-boundary refusals are focused helper evidence, not actual browser qualification of those complex assemblies. Display-context guards are source-checked; broad device/Windows/Linux and every context switch are not browser-qualified. Native document roundtrip is verified; neutral export and group rotation are not included. Existing drawing PDF golden limits remain unrelated.

Reproduce from repository root with Node 22:

```
node apps/cad-studio/scripts/test.mjs assembly-translate-selection
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
ASSEMBLY_TRANSLATE_SELECTION_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-translate-selection-browser.mjs <fresh output>
```
