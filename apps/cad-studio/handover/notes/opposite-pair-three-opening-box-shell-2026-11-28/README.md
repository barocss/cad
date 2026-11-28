# D2161 — Shell three original box faces including an opposite pair

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `670de7bd81fad372cb462978c30043ad17cf0e38`.

Per-face Shell accepts three distinct original faces of a zero-draft rectangular extrusion when two oppose each other. The other three original faces retain independent inward wall thicknesses. An exact rectangular cavity spans the opposed axis. The native validator checks stable named supports, connected closed topology and the world slab representation. Three picks use a deterministic cardinal order. The stored recipe and operation still use the existing three opening names and six source face signatures.

## Verification

- **PASS, actual desktop baseline and final.** The baseline allows a uniform wall on Top, Bottom and Front. The final preview offers Left 3 mm, Right 5 mm and Back 4 mm on the 40 × 30 × 20 mm fixture. Cancel preserves all 24,000 mm³. Apply yields 7,360 mm³ and centroid (22.2608695652, 19.5217391304, 10) mm. Setting Right to 37 mm meets the 3 mm Left wall and refuses the collapse. Editing Right to 8 mm gives 8,920 mm³. Undo, Redo and native Save/fresh Open preserve the expected shape and editor fields. The reopened strict B-rep digest is `01956f117a5aa412c900cc19abc941d53dd68a5d0da111b10b428e1b11c00d83`.
- **PASS, native geometry.** All 12 opposite-pair triples in six orders pass, including translated stock. Independent rectangular volume, centroid and area agree. Each single closed genus-zero shell has exact wall supports, complete pcurves and oriented tessellation closure. A through-Z cut gives 10 faces, 24 edges and 16 vertices. Horizontal through axes give 14 faces, 32 edges and 20 vertices in the world slab representation. Combined wall thickness that consumes the section is refused. All 22 existing closed, single and paired digests match the archived base. The old eight corner cases pass. A scratch mutation that halves the wall offsets fails the independent volume oracle at 8,880 versus 16,720 mm³.
- **PASS, local Agent and actual Studio.** An unrelated body changes from 500 to 800 mm³. Rebase & preview preserves the exact 24,000 mm³ source stock. User approval yields a strict 7,360 mm³ Shell and unchanged 800 mm³ peer. Undo, Redo and a native fresh Open pass. Changed stock and review evidence from a previous document both refuse. No external provider ran.
- **PASS, affected checks.** 67 Kernel, 18 Model and 49 Studio checks, kernel build, Model and Studio types, scoped ESLint, driver syntax and Studio production build. Both final desktop runs preserved the frozen files and reported zero page or console errors.
- **NOT_RUN.** Actual Studio scenes for the other opposite-axis combinations, four or more openings, general or fitted Shell, external CAD, mobile and full local suites. #13 stays open for its broader Shell scope. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-corner-shell-walls,part-shell-walls,part-adjacent-shell-walls,part-tube-shell-walls,part-opening-pair-shell-walls,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls attached-rib corner-proposal-review
pnpm --dir apps/cad-studio test shell-opening opening-shell held-shell agent-tools
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/baseline" --channel --baseline
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/final" --channel
CORNER_SHELL_PROPOSAL_FROZEN=1 node apps/cad-studio/test/corner-shell-proposal-rebase-browser.mjs "$OUT/agent-rebase" --channel
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
