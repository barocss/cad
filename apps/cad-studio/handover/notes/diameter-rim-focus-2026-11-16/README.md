# Diameter rim chooser focus (#48)

When overlapping drawing rims open a chooser, focus moves to its first candidate after the originating sheet pointer event finishes. Tab reaches the second named occurrence; Enter selects that rim and returns focus to the sheet, starting placement without saving a dimension. Escape closes the chooser and focuses the sheet while preserving the accepted document. The deferred focus is cancelled when the chooser becomes invalid or unmounts, and does not run on ordinary hover rerenders.

## Verification

- Actual Chrome WebGPU `drawing-diameter-overlap-browser.mjs` PASS at 1024×800 and 1440×900: initial first-candidate focus, Tab/Enter choice of either Plate occurrence, owner-specific placement hint, no saved dimension before the placement click, correct p1/p2 reference after placement, Undo, Escape focus recovery, reopened chooser, hidden-line setting invalidation, and exclusion of a lower rim with no drawn pieces. No browser/console errors; frozen-source receipts PASS.
- First browser run exposed native pointer default focus overwriting a synchronous effect; bounded deferred focus fixed the race and both final runs passed.
- Narrow-screen candidate screenshot inspected.
- Studio TypeScript/Vite production build PASS.
- Browser driver lint PASS. DrawingWorkspace.tsx retains five pre-existing unrelated unused-variable errors (`DrawingFix`, `_sig`, `_was`, `_leader`, `_sheet`); not a whole-file lint pass.
- There is no `diameter-rims` unit test file; that attempted test selector returned no match. Behavioral validation is the real-browser regression, not an invented unit-test pass.
- Evidence directories: `/tmp/cad-diameter-focus-r2-1024-20261116`, `/tmp/cad-diameter-focus-r2-1440-20261116`; build `/tmp/cad-diameter-focus-build-final.log`.

No geometry or reference-resolution changes. Assistive technologies and arbitrary multi-level assemblies were not run. #126 WIP and HOLD scopes remain unchanged.
