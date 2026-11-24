# D1975 — Verify Section vertex ownership and project roundtrip

P4 [row 5](../../roadmap-rows/05.md) and [row 20](../../roadmap-rows/20.md). [#272](https://github.com/barocss/cad/issues/272). Base `041cfb37191bb13e3022073b784e757b4b8f10d0`.

D1973 and D1974 qualify the supported axis and oblique native geometry. D1975 completes their current-source and project lifecycle checks. Two coincident original native vertices on visible base bodies now receive a specific refusal before the next section calculation. The original source mapping still accepts one verified retained straight-edge endpoint.

- **FAIL, previous ambiguity handling.** Studio sent a candidate section calculation when two visible bodies had original native vertices at the same position. The fixture's exact split then returned a generic error. The plane and working document stayed intact.
- **PASS, explicit ambiguity and recovery in WebGPU and WebGL2 Chrome.** The same corner is refused before any section request. Hide the other original body. The remaining visible corner again proposes the correct offset. The previous plane stands until Apply.
- **PASS, actual desktop ownership.** Both renderers pick the same original corner after camera movement and zoom. A section that removes the earlier body row still resolves the endpoint on the retained source. A genuine successful Worker reply is held while the user hides its source, opens a replacement with the same feature IDs, or starts a New part. Releasing each response leaves it retired. The test delays delivery only. The existing Cancel, Escape, Flip and original cap refusals remain covered by D1973 and D1974.
- **PASS, browser project Save, Close and fresh Open.** Apply at 45 mm retains 2343.75 mm³ without changing the source document, History, selection, dirty flag or saved bytes. Explicit Save preserves the same project file bytes. Close, reload and Open recover the original 10460 mm³ native part with the section cleared. The separate Sketch the section flow still produces an independent visible cut outline.
- **PASS, affected checks.** 22 Studio tests, types and production build, scoped ESLint and diff check. Earlier driver runs exposed a locator for an active project row, a click under the floating controls and a fixture whose output order was normalized on Open. The final harness reads the active row, reframes clicks through the actual viewport, and puts the removed body first in native feature order.
- **NOT_RUN.** Multi-plane or occurrence vertex moves, mesh vertices, full local suites and mobile. The issue's supported contract is one exact settled plane and one retained original native endpoint on a base body. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/prior" --oblique --coincident --baseline
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/coincident-gpu" --oblique --coincident
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/coincident-gl" --oblique --coincident --webgl
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/project-gpu" --oblique --ownership
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/project-gl" --oblique --ownership --webgl
D1011_SOURCE_FROZEN=1 node apps/cad-studio/test/section-visible-copy-browser.mjs "$OUT/sketch"
pnpm --dir apps/cad-studio test section-planes section-view section-vertex-evidence vertex-pick-filter mesh-circle-pick section-exclusion-session
pnpm --dir apps/cad-studio build
git diff --check
```
