# D1671 — Sweep a circular disk through a tangent elbow

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `4fb50ad7bb25cea5ed9e10eb7bb43b48f99611ec`

Exact Sweep accepts a circular disk on a Direct line–arc–line path. The circular arc spans 30°–120°. Both lines must follow the arc tangents in the direction of travel. The disk must clear the bend axis. The kernel compares the two common disk boundaries, removes both internal disks and retains the two outside caps. The exit section rotates with the bend so its two half circles match the arc's end chart. The two junction planes separate the adjacent pieces. A plane at the mid-angle separates the lead from the tail even when a long exit crosses the first junction plane. The Studio command, feature history and local Agent keep the existing Exact mode.

- **FAIL, base.** Both exact modes returned `CAPABILITY` for the same seven-pole path built by two native joins. The faceted control built with 2,402 faces and 691.706965441148 mm³. The circular disk area times the authored path length gives 696.377070788195 mm³.
- **PASS, affected checks.** Kernel 31, Model 23 and Studio 10 tests. Kernel fast build and types, Model types, scoped lint, browser driver syntax, Studio production build with types, and Git diff check passed. The focused native suite covers a long oblique 120° tail, reverse travel, an R3000 mm bend with a Ø0.2 mm disk, invalid inputs and the existing line-and-arc scope.
- **PASS, actual desktop Studio WebGPU and local MCP.** Join three Direct curves, refuse a kink at the exit, preview and apply the named elbow rail, and measure all four native junction edges. Each Studio read shows 0° over eight samples. The Ø40 mm axis-contact edit is refused with its accepted document unchanged. The Ø4 → Ø6 mm History edit, Undo, Redo, Save and fresh Open pass. The local MCP exposes the mixed path in command discovery, refuses a mismatched curve revision and a kinked path, and returns the expected dry-run volume without changing file bytes. Studio previews and explicitly accepts the proposal. Its native result equals direct creation. The elbow, line-and-arc and authored two-span circular controls deliver 12, 11 and 6 captures with zero page or console errors. The elbow source capsule contains 1,174 files and records zero changes. The D1670 line-and-arc control matches its recorded native digests, volumes and topology counts.
- **PASS, native geometry.** A 10 mm lead, an R20 mm quarter arc and a 14 mm exit produce one genus-zero solid with eight faces and fourteen edges. Native quadrature gives 696.377070788193 mm³ at Ø4 and 1566.848409273440 mm³ at Ø6. Mass and quadrature agree with the independent area-times-length oracle. Both junctions retain two half-circle edges. The largest sampled normal angle is 7e-14° and the largest sampled pcurve gap is 3.58e-15 mm. Sampled cross-edge curvature changes where the straight supports meet the bend. The Ø6 native digest after fresh Open is `d1c8c4c3bc354db6e87f4bdd3ff09741dc167fdda40c038bfa861b2d5d4b049a`. Direct creation and explicit Agent approval share the Ø4 digest `879b1239d8371400fb7bb98f1002de60885dc691ec56406678e1e7c6dadd0b3f`.
- **FAIL, first browser attempt.** The driver expected the internal kernel phrase for a kink. Local MCP correctly returned the user-facing tangent guidance. The driver now checks that guidance and all affected desktop flows passed.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess at base and after the change in `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3) and `thicken-planar.ts` (2).
- **NOT_RUN.** Full local suites, WebGL2, other mixed paths, extensions with holes, downstream Studio Boolean and Fillet, and live provider. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-tangent-sweep,exact-elbow-sweep}.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-elbow-sweep,exact-tangent-sweep,exact-arc-sweep,exact-straight-sweep,arc-sweep-bore-fillet,sweep-solid}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-tangent-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-tangent-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display arc-sweep-exterior-detail sweep-agent-remap direct-sweep-source-ids sweep-history-edit sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/elbow" --elbow
D1670_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/line-arc"
D1310_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs "$OUT/arc-pair" --make-curves
git diff --check
```
