# D1816 — Qualify the two-point Rectangle snap lifecycle

P1 sketch input, rows 09 and 15. [Issue #229](https://github.com/barocss/cad/issues/229). Base `19a319c2feb0eab43d7d6e9f08e8e69a23a99dd6`.

The original acceptance covers temporary endpoint-based distance or ratio for one Rectangle corner. It allows finite decimal input and the current workspace exit policy. The saved rectangle is independent of later construction edits. The existing implementation supplies this contract. The two new desktop drivers cover the remaining project and nonprincipal-plane evidence.

| Acceptance | Verified evidence |
| --- | --- |
| Two ordered visible construction endpoints and one explicit handoff | [D793](../two-point-sketch-snap-2026-11-12/README.md) picks endpoints, refuses the same point and a fraction string and passes (7.75, 3.25) mm once into the ordinary Rectangle gesture. The second corner uses the ordinary midpoint. |
| Signed decimal arithmetic, extrapolation and coordinate limits | The Model oracle covers reversed endpoints, negative distance, negative and greater-than-one ratios, degenerate and near-degenerate endpoints, Infinity, overflow and the coordinate range. [D794](../signed-sketch-snap-offset-plane-2026-11-12/README.md) independently verifies signed distance and the physical solid with the grid off. |
| Current plane and precision | D793 covers XY and D794 covers offset XZ. D1816 computes (20, 11.5) mm at ratio 1.5 on YZ at world X7, and (−4, 1.5) mm at ratio −0.5 on a 37° tilted frame. Both marker positions match their independently projected world points. The original construction geometry and IDs, exact rectangle, plane, Undo/Redo and native Save/fresh Open pass. |
| Draft ownership and duplicate input | D793 covers Escape, tool changes, repeated endpoint refusal and fresh retry. D794 covers plane and visibility changes. The production hook's focused ownership tests verify canceled or stale callbacks and once-only transfer under repeated submission. D1816 verifies actual Sketch Undo retires the pending draft, and Redo permits a fresh calculation. |
| File and project transitions | [D925](../two-point-snap-file-open-2026-11-13/README.md) proves bad File Open preserves the pending snap and successful Open retires it. D1816 verifies that Project and versions does not open a project picker while Sketch is active. New part opens the existing discard confirmation. Keep editing retains the draft. Discard clears it, and real browser Project Open in Model restores only the saved target. |
| Snapshot geometry and ordinary picking | Actual D793 and D794 extrusion and project readback preserve the construction identity and accepted rectangle. D794 trims the source after reopening and verifies the unchanged 180 mm³ solid. D1816 validates the same ordinary midpoint for the second corner on both authored planes. |

- **PASS — affected checks.** 9 Model and 7 Studio tests, scoped ESLint, driver syntax and Git diff check. The current desktop Chrome WebGPU runs have 16 checkpoints and zero source changes or browser errors.
- **FAIL — corrected harness assumptions.** An active project file has a label, and it gains an Open button when it is inactive. The Project toolbar icon can remain visible in Sketch while its panel stays unavailable. A free sketch uses its accessible History name. The initial plane fixture omitted normalized construction metadata, and the first tilted second-click location overlapped a zero-width dimension label. The final drivers use the exact authored construction IDs and canvas hits.
- **NOT_RUN.** Full local suites, local production build, alternate viewport backends, mobile, unsupported tool families and live providers. The first mechanical CAD baseline remains at 8/10 accepted. Overall CAD completion remains unmeasured.

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test osnap
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test two-point-snap-ownership
pnpm exec eslint apps/cad-studio/test/two-point-snap-{project-open,reopened-planes}-browser.mjs
node --check apps/cad-studio/test/two-point-snap-project-open-browser.mjs
node --check apps/cad-studio/test/two-point-snap-reopened-planes-browser.mjs
D1816_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-project-open-browser.mjs "$OUT/project"
D1816_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-reopened-planes-browser.mjs "$OUT/planes"
git diff --check
```
