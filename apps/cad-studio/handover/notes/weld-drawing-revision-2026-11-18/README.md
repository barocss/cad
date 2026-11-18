# #699 Standalone weld geometry revision marker

Baseline f571db8b73cb9fe56c485c5d7bfdab3ba0fbb060. Studio issues an inline welded frame as REV A. Public set_welds changes its leg from 2 to 3; nodes and the saved stamp remain unchanged while the bead volume changes from 330.6667 to 756 mm³. Opening the returned document in Studio previously displayed the changed three-body drawing without a stale warning. This tests actual dispatcher output consumption, not a dedicated weld editor UI.

The marker now includes requested bead features and relevant shared ownership. Notes/allRound, missing/no-size/butt and explicitly suppressed inputs are excluded. It never evaluates geometry and never reads refusal caches: a requested feature later refused by the kernel is conservatively a dependency, not a manufacturing certificate. Ordinary and section-only stamps are unchanged. Old bead-backed node-only issues need explicit reissue; saved values are not silently overwritten.

## Verification
- Frozen actual Chrome baseline: expected FAIL, stale0 despite changed bead.
- Frozen fixed Chrome: PASS, stale1, native Save/fresh Open retains A and warning. Explicit B clears warning; Undo/Redo restores exact issued documents. Screenshots inspected.
- Both runs changes=[] and context/browser/server cleanup complete.
- Focused revision suites 21/21 PASS, including annotation-only, suppressed plate reachability, legacy/native and evaluation-cache stability. Owned ESLint PASS. Type results recorded in issue.
- Run drawing-weld-revision-browser.mjs with DRAWING_WELD_REVISION_FROZEN=1. Existing unrelated PDF/lint limitations unchanged.
