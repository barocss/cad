# Interior Fillet picked-edge recovery (#23)

## Boundary and reproduced gap

Only the exact `FILLET_CHAIN` build refusal for an interior radius on more than one explicitly picked original edge receives selection-count and `Edit picked edges` guidance. The helper checks a single current named body with distinct removable rows. It does not infer tangent topology, admit another edge combination, change stored picks or repair references. Native code/detail remain available. Unsupported single-edge geometry and unrelated errors retain their existing fallback.

The current parent was reproduced on a 40 × 30 × 10 mm box: one top edge with radii 1.25, 3, 1, 2.5 and interior stations 25%, 62.5; Shift-picking the right top edge yielded only the generic straight-edge error. Existing list removal already restored the preview without losing input. Baseline actual Chrome passed document preservation, removal, Apply and Undo/Redo (`/tmp/cad-fillet-selection-baseline03`). Earlier driver failures were a case-sensitive status expectation and a setup path error, not product regressions.

## Verification

PASS: new and adjacent tests 7/7, Studio TypeScript, changed-file ESLint, and production build (4.10 s). Frozen-source actual Chrome at 1024 × 900 passed the new count/recovery hint, unchanged accepted document, all radius/station inputs, removal, Apply, Undo/Redo and in-memory reopen (`/tmp/cad-fillet-selection-final01`). Both final screenshots were visually reviewed. No page errors, console errors or downloads occurred. Existing Vite directive/dynamic-import warnings remain; they did not fail the build. No Shell, manufacturing, native topology or protected worktree changes. #23 remains open for its separate tangent-scope, shaped-section and imported STEP conditions. No full kernel suite, new geometric acceptance or physical export is claimed.

Run from Studio with Node 22.19.0 and the shared heavy lane:

- `node scripts/test.mjs interior-fillet-picked-feedback closed-fillet-perimeter`
- `node ../../node_modules/typescript/bin/tsc --noEmit`
- changed-file ESLint; `node ../../node_modules/vite/bin/vite.js build`
- `FILLET_SELECTION_FROZEN=1 PW_DIR=... CHROME=... node test/fillet-interior-selection-browser.mjs OUTPUT`

The browser driver uses public mouse picking and the existing removal list; the original document and all six numeric inputs are checked, followed by Apply, Undo/Redo and in-memory reopen. No file download is authorized or performed.
