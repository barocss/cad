# Parameter edit recovery after geometry refusal (#619)

Baseline: `8dc493ace7e597888cb65aef0076aa60b20ec561`.

## Cause and bounded change

`App.tsx` captures the current work scope in render-time edit callbacks. A
refused parameter candidate restores the cached accepted evaluation. Starting
that handoff advances the ownership scope, but completing it can set only values
React already holds. No render then refreshes the callback's captured scope, so
the next valid edit is refused as stale. That refusal's notice causes a render,
which explains why an identical second submission worked.

After the current live evaluation actually releases its token, explicitly
request a render. Superseded tokens and unmounted/cleaned-up effects do not
request it. Pending/stale admission rules, document/history objects and worker
ownership semantics remain unchanged. There is no schema or kernel change.

## Verification

- New `test/parameter-geometry-retry-browser.mjs` ran in real Chrome at 1024x900
  and 1440x900: Width40 -> invalid0 -> valid50 with 1200ms wait, then invalid0 ->
  valid60 without an added wait. Each valid value was submitted exactly once.
  All four transitions passed; accepted nodes/configurations and Undo/Redo
  volumes (width * 20 * 5) passed. No page/console errors or source changes.
- The same first-submission assertion failed on the pre-fix QA copy, timing out
  at Width50. Its App.tsx SHA256 matched baseline exactly:
  `f7d5f12b70ddbd7a65424e6a2332a544340207a406dce0905c9b004d2802e2f0`.
- Existing `stop-work-ownership` tests: 13/13 passed, including pending edits,
  stale callbacks, superseded completions, Stop and document replacement.
- Studio `tsc --noEmit` and Vite production build passed.
- Normal App lint still reports the pre-existing unused `_k` binding; the same
  binding exists in baseline. App lint with that rule disabled passed. No
  baseline lint cleanup is included. `git diff --check` passed.
- Screenshots were inspected for the recovered parameter and model. The prior
  parameter-refusal toast remains displayed; notice lifetime was not changed.

Not run: full suite/CI, Save/fresh Open, configuration Apply or other parameter
geometry families. This is a bounded recovery regression, not whole-CAD
qualification. Existing #126 uncommitted files were not modified or committed.
