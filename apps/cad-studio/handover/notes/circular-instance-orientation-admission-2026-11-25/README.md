# D1929 — Refuse stale saved orientation in a circular instance pattern

P3 [row 10](../../roadmap-rows/10.md), [#263](https://github.com/barocss/cad/issues/263). Base `77403b1568e3fbacb5b55c3b2153d1d0f4b6dc93`. SMALL native admission fix.

The current Keep recipe copies the seed Euler angles as written. The native reader checks that each saved top-level fixed occurrence has the exact authored seed rotation and expected occurrence identity. It refuses stale, missing or unexpected occurrences by name. The reader keeps the original rotating pattern rules.

- **FAIL, previous desktop Studio.** Open accepted a file with Keep set but occurrence `pat1-1` stored at 180° while the seed stayed at 90°. The right property showed Keep. Its displayed X minimum was 0 mm instead of 6 mm.
- **PASS, current desktop Studio.** The same file refuses with `PATTERN_VALUE`. The accepted document, placement bounds, selection and Undo/Redo state stay the same. A held genuine root Worker reply (request and revision 7) blocks the second edit without changing the accepted pattern, document, selection or history. Releasing it lets the root Move settle. Undo and Redo affect the Move alone, and a new orientation Apply succeeds.
- **PASS, document owner.** A later Open with the same name and occurrence IDs adopts the new assembly. Releasing the earlier native file read does not replace it or restore the unapplied Keep draft. A fresh Save and Open preserve the newer accepted state.
- **PASS, affected checks.** Five actual current checkpoints and one previous-build scene. All 41 Model tests and Model types, scoped ESLint and diff check. The first browser harness expected Undo/Redo of an unrelated Move to discard an unapplied inspector draft. The final harness checks the accepted document and history independent of that draft.
- **NOT_RUN.** Actual Studio export of both modes, general nested-pattern admission, stale positions that retain the correct saved rotation, full local suites, mobile and paid providers. The existing #263 remains open for its output checks. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

```sh
PATTERN_LIFECYCLE_FROZEN=1 node apps/cad-studio/test/instance-pattern-orientation-lifecycle-browser.mjs "$OUT/baseline" "$PRIOR_STUDIO_KEEP_FILE" --baseline
PATTERN_LIFECYCLE_FROZEN=1 node apps/cad-studio/test/instance-pattern-orientation-lifecycle-browser.mjs "$OUT/studio" "$PRIOR_STUDIO_KEEP_FILE"
node packages/barocss-cad-model/scripts/test.mjs instance-pattern
pnpm --filter @barocss/cad-model type-check
git diff --check
```
