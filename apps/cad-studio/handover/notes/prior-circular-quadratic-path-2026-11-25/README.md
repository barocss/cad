# D1950 — Repeat the earlier circular through-cut on one polynomial quadratic Path

P1 [row 3](../../roadmap-rows/03.md) and [row 8](../../roadmap-rows/08.md). [#25](https://github.com/barocss/cad/issues/25). Base `e1904421a30a1d61c9240cd1f289d6d8d3dcd3a1`. Full geometry change.

The first original circular through-Subtract on upright rectangular stock can repeat along one clamped polynomial quadratic span at a constant Z when one original rectangular through-Subtract follows it. The existing bounded length planner produces fixed-orientation XY offsets. The existing circular placement check proves clearance against the stock, the later cut, the original cut and every earlier copy before any Boolean runs. The fit, work limits and native file fields stay the same.

- **FAIL, previous Studio.** A real linked curve with poles (0,0,0), (20,0,0) and (20,20,0) could be chosen. Preview refused it solely for using a polynomial quadratic with an earlier circular cut.
- **PASS, actual desktop Studio.** Author the curve with Sketch, Make curves and the Direct middle-point editor. Select the original Subtract in Browser. Make two copies at 10 mm spacing, edit spacing to 12 mm, Undo, Redo, Save and fresh Open. A 4 mm pitch violates clearance and 21 mm overruns the path. Both refusals keep the document and History. The canonical circular quarter-arc and older rectangular-source quadratic desktop controls pass.
- **PASS, independent native geometry.** Integrate the speed of the quadratic and invert cumulative length independently. At 10 mm spacing the predicted copy centers are (19.804642849, 11.636145466) and (27.287138970, 17.980960867) mm. Placement agrees within 1e-7 mm. The 60 × 40 × 10 mm stock keeps the original R2 bore and the untouched 4 × 2 mm rectangular opening. All three bores give 23920−120π = 23543.008881569 mm³ and one genus-four shell, 16 faces, 42 edges and 28 vertices. The original and copied cylinder names and native reopen agree. Count one and the collision with the later rectangle are checked separately.
- **PASS, affected checks.** 31 Kernel, 18 Model and 12 Studio checks. Library and Studio production builds, affected types, scoped lint and diff check pass.
- **FAIL, corrected intermediate checks.** The first focused Kernel run kept an obsolete quadratic-refusal assertion. The replacement checks unsupported rational weights. The first focused Studio selector found no matching file. The direct curve and fill candidate check groups pass.
- **NOT_RUN.** General curved or mixed spans, more than one later cut for the circular source, independent STEP, exact Agent tool execution, full local suites and mobile. #25 remains open. First mechanical CAD is 8/10; overall CAD remains unmeasured.

```sh
D1950_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/baseline" --quadratic --baseline
D1950_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/studio" --quadratic
D1931_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/quarter" --quarter
D1862_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/old-source" --quadratic
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-path-cut-pattern,prior-path-cut-pattern,prior-circular-linear-cut-pattern,prior-circular-fill-cut-pattern,prior-circular-rectangular-cut-pattern}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs api-curve-feature-pattern toolset.test
node apps/cad-studio/scripts/test.mjs direct-curve-candidate fill-pattern-candidate
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

Screenshots and native inspection files stay outside Git.
