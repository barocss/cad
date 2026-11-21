# D1628 — Propose Thicken from a visible Direct surface

P5, row 08, [#322](https://github.com/barocss/cad/issues/322) and [#11](https://github.com/barocss/cad/issues/11). Base `1fe00ca431bc023484898130dfe9bc2f23b69aa8`.

Read the whole visible Direct surface ID and `direct_revision` from `query.summary`. Use `features.command` as a `proposals.propose` operation with `command: "direct-thicken"`, `expectedRevision` and `values: { surface, t, side }`. The existing Studio Thicken command copies the support of the reviewed surface. The resulting body retains the snapshot when the source changes. Current Thicken builds the body through the sampled surface path. D338 records the existing public face grouping and persistent native facet names.

- **PASS, local MCP.** Autonomy L4 refuses direct application and self-acceptance. A stale revision or zero thickness refuses before the file changes. The valid proposal leaves the two original rails, source sheet and empty body list intact. The focused regression also refuses a hidden or trimmed source, and refuses Agent acceptance with an altered saved risk flag.
- **PASS, desktop Studio WebGPU.** Preview shows an added 3,600 mm³ body. Hiding the source sheet clears the preview and prevents rebasing. Undo restores it. Human approval adds one Thicken feature and preserves the original Direct geometry. Undo, Redo and native Save plus fresh Open reproduce the expected documents. The source capsule covers 1,164 files with zero changes, page errors and console errors.
- **PASS, native geometry.** A 40 × 30 mm planar Ruled sheet at Z = 3 mm thickens symmetrically to bounds [10, −6, 1.5] and [50, 24, 4.5] mm. Native thickness is 3 mm and volume is 3,600.0000000000005 mm³ against 3,600 mm³ from length × width × thickness, with a 1e−8 tolerance. The strict checker accepts the closed solid and its six faces in this fixture. The reopened B-rep digest is `145bcd8336ae64fe88af1425df10dd92fc79a78aa410045af3908ecdae7612ee`.
- **PASS, affected checks.** Model 28, Model type check, scoped ESLint, generated Agent docs check, Studio build, browser syntax and Git diff. The 13-tool contract is 24,915 of 25,000 characters per turn.
- **FAIL.** None in the final checks.
- **NOT_RUN.** Broader curved Thicken, WebGL2 product run, paid live model and full local suites. Exact planar Thicken is a separate opt-in milestone. Both issues remain open.

Use Node 22.19.0, installed Chrome and Playwright, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad-model test agent-direct-thicken toolset tool-contract proposals
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1628_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT"
git diff --check
```
