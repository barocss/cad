# D1926 — Move section and overlay test observations out of Studio App

P4 [row 12](../../roadmap-rows/12.md) and [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `a86d3f4e7e5641059f5ad0deef72609e34f8eddb`.

The viewport test module now registers the Section state and debug commands, overlays, and benchmark cloud actions. App passes the current state and its existing owners at the same hook position. The module preserves the latest viewport reads, named body mapping, exact and shown section volume, and the existing absent-value semantics. App changed from 2513 to 2494 lines.

- **PASS, actual before and after.** All 18 checkpoints have identical document, selection, section, history, bodies, dirty state and recorded Undo availability. Camera and scenario observations match. Both the native WebGPU section and the forced CPU path on that viewport keep the instance exclusion, original pick results, clipping, live drag, Frame all, and exclusion reset at fresh Open.
- **PASS, affected current flows.** Four actual exact-section measurement states keep 12.81 mm between the original faces and refuse a generated-cap selection without changing the measured pair. Seven actual Direct Ruled proposal states verify its overlay, stale rail refusal, explicit approval and fresh Open.
- **PASS, focused checks.** Three Studio tests, scoped ESLint, Studio production build and diff check.
- **FAIL.** None in the exercised paths.
- **NOT_RUN.** Native WebGL2, independent version-comparison and benchmark cloud paths, full local suites, mobile and paid providers. The desktop UX issue stays open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
SECTION_SELECTIVE_FROZEN=1 node apps/cad-studio/test/section-selective-instance-browser.mjs "$OUT/baseline"
SECTION_SELECTIVE_FROZEN=1 node apps/cad-studio/test/section-selective-instance-browser.mjs "$OUT/studio"
D1013_SOURCE_FROZEN=1 node apps/cad-studio/test/section-original-measure-browser.mjs "$OUT/measurement"
D1625_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-agent-proposal-browser.mjs "$OUT/proposal"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test section-display section-exclusion viewport-display-policy
pnpm --dir apps/cad-studio build
git diff --check
```
