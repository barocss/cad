# D1520 — Create a Smooth Turn with continuous full-height sides

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `060c83e1998510b772ff49b195db5a029eda07e3`.

Studio adds **Smooth Turn** for one standalone rectangle, with the same height and signed angle controls as Ruled Turn. The ruled construction uses straight corner rulings in each span and shrinks the section between stations. Smooth Turn stores a native Smooth Loft from evenly spaced rotated sections. Adjacent sections rotate at most 30°. A compact cubic uses one pole per station, within the existing native limit. Four full-height surfaces share the same corner rails. Simple internal knots give C2 continuity along the turn. A Bernstein coefficient check proves the sign of the shared rotation factor on each knot interval. The rails retain the authored cap endpoints within the admission tolerance. A single rotation-factor curve keeps intermediate sections rectangular and the Greville heights keep the axis direction linear.

The compact route admits seven to sixteen same-centre congruent rectangles at uniform height and angle steps. Other existing Smooth Loft inputs keep their original route. The stored command creates an approximation to a rigid rotation. General profile shape changes, continuous-law History editing and helical screw remain separate.

## Verification

- **PASS, desktop Studio.** Create two identical rectangles at separate locations. Compare +360° Ruled and Smooth Turn at the same 40 mm height. Verify the opposite Smooth Turn direction and +450° at 50 mm. Perform Undo, Redo, native Save and fresh Open. Both solids remain strict-valid, and the reopened smooth native digest agrees exactly.
- **PASS, native geometry.** Each smooth result contains four continuous side faces and two caps, with twelve boundary edges and no intermediate section rings. The 12 × 8 mm profile gives 3840.49391848882 mm³ at ±360°/40 mm and 4800.28012985653 mm³ at +450°/50 mm. The ruled +360°/40 mm control is 2560 mm³ with 18 faces. Faint shading lines still appear on some continuous faces in the default Studio view. The observed smooth corner deviation from the ideal rotation about the straight axis is at most 0.016 mm across the sampled heights. Independent area integration, signed derivative checks, knot continuity and scoped refusal controls pass.
- **PASS, focused checks.** 99 Kernel, 51 Model and 43 Studio tests, Kernel and Studio builds, Model and Studio types, scoped lint, browser syntax and Git diff. The earlier desktop Ruled Turn workflow keeps its native Save/Open and base-width edit. An independent geometry review also passes the thin, short-height and nearly straight controls.
- **NOT_RUN.** General fit, arbitrary axis law, STEP, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and freeze worktree writes during Studio. Keep external evidence out of Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{smooth-rectangular-turn,loft-nurbs-guide,loft-two-guides,loft-guide-control-range,oriented-loft,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command revision-pinned-command loft-guide-command loft-section-history-edit api-loft-guide toolset tool-contract
pnpm --dir apps/cad-studio test command-apply history-feature-apply history-feature-editor
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad-model/src/app/{ruledTurnCommand,profileCommands}.ts packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/ruled-turn-command.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/smooth-turn-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_SOURCE_FROZEN=1 node test/smooth-turn-browser.mjs "$EVIDENCE/comparison"
RULED_TURN_SOURCE_FROZEN=1 node test/ruled-turn-browser.mjs "$EVIDENCE/ruled-control"
```
