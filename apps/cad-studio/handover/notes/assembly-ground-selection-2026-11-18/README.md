# Atomic selected-part Fix / Unfix (#642)

Base `63f8fbb95`. An additive static-assembly capability, not a corruption bug or a fabricated failing baseline. Prior viewport and outliner instance picks both replaced selection with a single ID. The outliner now allows Ctrl/Cmd-click to toggle top-level parts, with ordinary click, nested picking and viewport picking unchanged. A multi-selection panel explicitly fixes or unfixes all selected parts in one document commit/Undo.

The pure helper checks every unique target before returning any changed occurrence. Missing/nested/pattern-driven selections refuse wholly. Fix refuses any selected b-side mate target, matching the existing directional grounding policy; Unfix retains that policy. Current-face readiness and the existing current-document acceptance guard remain. No-op requests do not create history. Placement, definition identity, geometry and unrelated parts are preserved. Single-part controls remain unchanged.

Additive picking removes IDs absent from the current document and drops nested ownership; batch execution validates all requested IDs again. Existing singleTop / length-one guards keep mate, bearing, instance editing and gizmos single-owner. Selection changes clear the bearing edit owner. New/open already clears selection; the batch panel is unavailable in Drawing and active command contexts. This does not change schema, solver, motion, manufacturing or existing HOLDs.

## Verification

- Focused unit tests 4/4 PASS: mixed fixed/free and no-op identity; duplicates; missing/nested/pattern atomic refusal; mate refusal and existing Unfix policy; ordinary/additive selection ownership.
- Studio type check PASS after correcting test fixture creation to use `emptyDoc`; first run had two test-only missing required document-field errors.
- Final focused ESLint, including App and both new tests, PASS; `git diff --check` PASS. A stale callback comment was corrected after the frozen runs, with no executable change.
- Actual Chrome run03 PASS: real Cmd-click selects and toggles two separate blocks; Fix and Unfix each undo/redo with one history operation; ordinary click and Enter retain single selection; Escape clears; fixed flags survive actual native Save and fresh-context Open; file replacement clears selection; a mixed free-cap + mate-driven-block batch refuses with the exact entire document unchanged.
- First browser run failed its comparison because existing `commitAssembly` normalizes absent mates to `[]`; comparison now checks semantic equality. Second run had a Mac Ctrl-click/selection-read expectation failure; Mac actual selection uses Cmd-click and waits for the panel render. Both failed receipts are retained. Product source was not changed between those browser runs.
- All three frozen source capsules equal their after-cleanup capsules. Fixed/refusal screenshots were visually inspected: both selected rows and both highlighted parts are visible, grounded count and action availability agree, refusal text is readable.

## Limits

Synthetic support-block assembly, not customer geometry. Ctrl-click on Windows/Linux, viewport replacement, nested UI and Steps/Isolate interactions were source-audited, not browser-qualified here. Nested/pattern/missing and mixed initial grounded-state behavior are covered by focused helper tests, not claimed as actual browser runs. Existing PDF golden/lint limits from earlier drawing work are unrelated and not repaired by this change. No claim of whole-suite CAD parity.

Reproduce from repository root with Node 22:

```
node apps/cad-studio/scripts/test.mjs assembly-ground-selection
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
ASSEMBLY_GROUND_SELECTION_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-ground-selection-browser.mjs <fresh output>
```
