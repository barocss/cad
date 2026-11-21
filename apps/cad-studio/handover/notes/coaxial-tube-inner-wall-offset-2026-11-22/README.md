# D1597 — Offset the inner wall of an upright coaxial tube

P5, row 31, [#629](https://github.com/barocss/cad/issues/629) and [#17](https://github.com/barocss/cad/issues/17). Base `89cdeb61f515f23d2f42a3311708e9d5a139315c`.

Offset face now accepts the two native patches of a straight through bore in the certified upright coaxial circular tube. A positive distance moves the inward support toward the axis and adds material. A negative distance removes material. The operation keeps the outside cylinder, cap planes and outer trims fixed. It keeps native face, loop, coedge, edge and vertex identities. Only the inner wall, its boundary and the inner cap trims move. The coaxial check permits binary64 roundoff at the part scale. The existing linear tolerance governs clearance to the axis and outside wall.

- **FAIL, base capability.** The previous native path rejects the selected tube bore as an unsupported cap offset. The native tube itself evaluates correctly.
- **PASS, desktop Studio WebGPU.** Open the 18 mm outside diameter tube with an 8 mm bore and 16 mm height. Pick the inner face in the viewport. Apply +1 mm to shrink the bore from R4 to R3. Edit History to −2 mm to enlarge the bore to R6. History refuses +4 mm at the axis and −5 mm at the outer wall, with the last accepted document intact. Undo, Redo, Save and fresh Open pass. Fresh Open reproduces the exact native B-rep.
- **PASS, independent geometry.** The axis passes through (14, 9) mm, and the two cap planes stay at Z0 and Z16. The expected volume is π × (81 − r²) × 16 mm³. Native volumes at R4, R3 and R6 are 3267.256359733384, 3619.1147369354435 and 2261.9467105846597 mm³. Maximum volume error is below 1e−11 mm³. Maximum edge-to-surface gap is 3.98e−15 mm. The six faces, eight loops, 24 coedges, 12 edges and eight vertices retain their IDs. The original outer walls and outer cap trims are fixed. Kernel regression also refuses an eccentric axis 1e−9 mm away from the centre and the outer wall selection. The existing eccentric cap operation still passes.
- **PASS, affected checks.** 75 Kernel tests, 111 Model tests, 41 Studio tests, Kernel and Model types, Studio types and production build, scoped lint, browser syntax and Git diff. The frozen browser run covered 1161 source files and reported zero changed files, page errors and console errors.
- **NOT_RUN.** Tilted or multiple bores, other renderers, exchange, stdio MCP, mobile and full local suites. #629 and #17 remain open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Run one heavy check at a time under the gate and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset,bored-cap-offset}.test.mjs
pnpm --dir packages/barocss-cad-model test offset-face-native native-offset-face native-offset-circle-browser native-offset-result rematch references
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset.ts,part/part-model.ts} packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset}.test.mjs packages/barocss-cad-model/src/app/{nativeOffsetFace,offsetFaceEdit,profileCommands}.ts packages/barocss-cad-model/src/engine/{doc,references,rematch}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/circular-wall-offset-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply offset-face-launch-view
pnpm --dir apps/cad-studio build
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$EVIDENCE" --tube
node --check apps/cad-studio/test/circular-wall-offset-browser.mjs
git diff --check
```
