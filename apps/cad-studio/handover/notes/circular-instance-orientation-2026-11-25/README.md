# D1928 — Keep the seed orientation in a circular instance pattern

P3 [row 10](../../roadmap-rows/10.md), [#263](https://github.com/barocss/cad/issues/263). Base and previous reader `0329d7b248c398eeb42ad6f9348a46cd9ddd792f`. FULL for the Model facade and agent inputs.

Studio offers **Rotate with pattern** and **Keep seed orientation** on ordinary top-level circular instance patterns. The default keeps the original rotation rule. Both modes use the existing orbit. Keep copies the current seed rotation on every evaluation. Add and Edit share the Model contract with the facade and agent. Circular reads with no orientation field mean rotate. The controls retain the authored axis, origin and Skip list.

The native file uses `circular-fixed` for Keep. The distinct saved kind lets the previous reader refuse the file with `PATTERN_VALUE`. The original `circular` kind and the schema numbers keep their meaning. Before implementation, the previous reader accepted a trial `orientation` field on the old kind, so that representation was rejected. The current reader refuses such ambiguous files.

- **PASS, actual desktop Studio.** The previous build had no orientation control and rotated the asymmetric bracket with the orbit. Current Studio verifies Cancel, both orientations, unchanged placement origins, IDs and shared definition, Undo and Redo, Skip and Restore, Save and fresh Open, a seed turn from 90° to 0°, and a combined count and mode edit. Seven current scenes and one previous-build scene. Four separate legacy origin control scenes also passed. BOM after Open shows one line and quantity 3 after one Skip.
- **PASS, independent placements and native output.** The 10 × 4 × 2 mm bracket orbits through (20,5), (10,15), (0,5) and (10,−5) mm. In Keep, its local +X endpoint maps to (20,15), (10,25), (0,15) and (10,5) mm. Literal box bounds agree with Studio within `1e-6 mm`. Model drawing input has the exact four expected vertex sets and 80 mm³ per bracket. Reimport of Model STEP has five strict B-rep bodies including the base and retains the vertex set. The Model BOM has one shared bracket row and quantity 4 without Skip. A tilted seed on a nonunit axis with negative angle, a fixed-side lock and its dependent placement, and invalid and wrong-kind input refusal passed.
- **PASS, previous reader against actual Studio downloads.** The previous reader bundle hash is `844a6367223645be00bac3f7ca3417a449f40ee8b9bd305917c9c899f0c43349`. It accepts the rotating file (`ae48c698770b3908b79a530f6fe7c7e3d77036646d8ad9934b890a506b510125`) and refuses the Keep file (`5daac5855e72f469312ee2710e51aa41f1e462ba98dbfd73a7d57ebb74c5bb3e`). Current Studio reopens Keep with the correct poses and exact Skip.
- **PASS, affected checks.** Model 40 tests and Studio 18 tests. Model and Studio types, scoped ESLint, regenerated agent tool table, Studio production build and diff check. Separate scratch mutations replace Keep with orbit rotation, serialize Keep as the legacy kind or omit wrong-mode refusal. The targeted tests detect all three.
- **FAIL, earlier check attempts.** Initial tests omitted the native mass density and expected the previous unknown-kind wording. The Studio test runner initially used the wrong directory. The initial type and lint check caught test-only typing and unused destructuring. The final checks include the corrections. The first type and lint command overlapped the start of the final Chrome run. The worktree remained frozen while Chrome ran.
- **NOT_RUN.** Pending or late result ownership for this action, actual Studio Drawing and STEP downloads, independent external STEP reader, nested patterns, broad full local suites and mobile. The issue stays open. Next qualify the specific live ownership and output gaps from the issue. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

```sh
PATTERN_ORIENTATION_FROZEN=1 node apps/cad-studio/test/instance-pattern-orientation-browser.mjs "$OUT/baseline" --baseline
PATTERN_ORIENTATION_FROZEN=1 node apps/cad-studio/test/instance-pattern-orientation-browser.mjs "$OUT/studio"
PATTERN_ORIGIN_FROZEN=1 node apps/cad-studio/test/instance-pattern-origin-browser.mjs "$OUT/origin-control"
node packages/barocss-cad-model/scripts/test.mjs instance-pattern
pnpm --dir apps/cad-studio test instance-pattern-draft mate-pattern-commit instance-pose
pnpm --filter @barocss/cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm build
git diff --check
```
