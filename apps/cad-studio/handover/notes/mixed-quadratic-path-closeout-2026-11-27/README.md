# D2054 — Qualify mixed quadratic Path relinking and equal-radius cut ownership

P1 [row 7](../../roadmap-rows/07.md) and [row 8](../../roadmap-rows/08.md) · SMALL · [#760](https://github.com/barocss/cad/issues/760). Product base `080a091c4690ed097112fbc4d533c4e0526d86d7`.

The existing History editor can relink the quadratic Path built in [D2035](../prior-circular-mixed-curved-path-2026-11-27/README.md). Extend the desktop regression that exercised the quarter arc in [D2042](../mixed-path-history-relink-2026-11-27/README.md). Add the issue's equal-radius original-cut check to the existing native matrix.

- **PASS, desktop Chrome/WebGPU.** Author the level polynomial quadratic and repeat original Subtract `n4` on a 60 × 40 × 10 mm plate with a later R3 hole and a rectangular through-cut. Edit spacing from 14 to 15 mm. Undo and try the path pointing at the R3 centre. At 14 mm the proposed copy is 4.027756 mm from the R3 centre, below the sum of the two radii. Studio refuses the change with the path-specific notice and preserves the document, native walls and available Redo. Cancel a staged compatible choice, then replay Redo and apply the compatible vertical path.
- **PASS, desktop persistence.** The compatible choice keeps the original cut reference, count and spacing. Only the path link and copy placement change. At 15 mm the copy moves from (24.091898, 14.167629) to (10, 25) mm. The original cuts retain their native walls. Undo restores the quadratic. Redo and actual Save/fresh Open restore the vertical path and the same strict one-body result of 23,385.92924888973 mm³. The revised driver also passes the canonical quarter-arc relink control.
- **PASS, same-radius native owners.** The original R2 walls at (10, 10) and (25, 19) retain their distinct `circleTool.side[round]` and `newTool.side[newRound]` owners. Only the new R2 copy bears `[round]@1`. Both accepted pitches rebuild one strict shell of genus four at `23920 − 120π` mm³. The exact tangency and overlap refuse. Native serialization preserves both original wall sets and the copy.
- **PASS, affected checks.** Kernel library build, 20 native checks, 8 Model checks, 13 Studio checks, scoped ESLint, syntax and diff check. The two desktop runs had no console errors, page errors or frozen-source changes.
- **FAIL, initial lint.** The existing driver declared an unreassigned variable with `let`. The scoped cleanup and lint rerun passed.
- **NOT_RUN.** Full local suites, local Studio production build and mobile. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

## Original acceptance

[D2035](../prior-circular-mixed-curved-path-2026-11-27/README.md) establishes both bounded path forms from Browser and History, independent clearance and placement, source identities, and native Save/Open. D2042 verifies the quarter-arc relink. D2054 qualifies the quadratic relink and equal-radius original cuts. Earlier cut support stays within the verified upright through-cut chain and the existing certified level paths. Arbitrary cutters, profiles and paths have separate acceptance.

```sh
D2035_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/quadratic" --mixed --quadratic --history --relink
D2035_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/quarter" --mixed --quarter --relink
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-path-cut-pattern,curve-cut-pattern}.test.mjs
pnpm --dir packages/barocss-cad-model test api-curve-feature-pattern
pnpm --dir apps/cad-studio test direct-curve-candidate fill-pattern-candidate
pnpm exec eslint apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs packages/barocss-cad/test/prior-circular-path-cut-pattern.test.mjs
git diff --check
```

Desktop receipt SHA-256: quadratic `9bebee17ac667a79aa9d35c3c4330caf490608a3d45eb2ad8b8391179aa93e7d`, quarter arc `44083f1d668c469efb5665e4511809e9a4c9a5588114acab1ac02d2ad12734d4`.
