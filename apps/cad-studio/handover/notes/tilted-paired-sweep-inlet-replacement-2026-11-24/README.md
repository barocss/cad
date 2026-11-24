# D1885 — Replace the original five-span Sweep inlet with an inward tilted plane

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `9bb5df710b8990c9f96cdb32af9809117ecaa1d4`.

Replace face now accepts the original straight inlet of the same exact line–arc–line–arc–line Sweep with two rectangular passages. It replays the complete original sweep and reuses the existing inward cap trim, with the lead walls and the inlet's outward rail. It requires the current native donor and keeps the original support planes. The same command is available in Studio and the named local command.

- **FAIL, unchanged desktop.** The actual viewport picks the native inlet and the Replace face command is unavailable. The detached donor already lies on the correct tilted plane. The baseline reproduction passes its expected-refusal assertions.
- **PASS, independent native geometry.** At `x = −9 + y/4`, the outer rim lies at X−9.5 to X−8.5 mm. The new outward normal is `(−4,1,0)/√17`. Volume `32(23 + 15π)` is 2243.9644737231 mm³. Analytic moments yield centroid (13.1436025566, 18.9277223366, 0) mm. The trim affects 12 vertices and 24 linear edges on their exact charts. Both passages, every original native ID and 48 join charts remain. The solid has genus 2, 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices. Cut planes that touch the old end, partly move outward, meet the first join or leave less than the existing minimum straight length refuse.
- **PASS, desktop Studio.** Eight inlet states, eight tilted outlet controls and six parallel inlet controls pass. The actual inlet previews, applies, follows a donor Move from intercept −9 to −8 mm and retargets to the opposite donor face at −8.5153882032 mm. Undo, Redo, Save and fresh Open retain the edited model. The accepted native digest `77347dace9edc1307f00f43c21112cbcc2c96ab4b0f3d0b89f327774c3c04edb` is unchanged after Open. Offset face refuses the tilted donor, and loading a collapsed replacement or held donor retains the last accepted model.
- **PASS, affected checks.** 71 Kernel, 95 Model and 9 Studio tests. Kernel and Model types, scoped lint and the Studio production build pass.
- **FAIL, first Model harness.** JSON writes native signed zero as zero. The initial equality compared the decoded file to its pre-serialization JavaScript object. The final test compares serialized contents and independently recomputes the native volume after readback.
- **NOT_RUN.** Whole local suites, outward tilted extension, later edit-chain caps, other paths or profiles, other renderers, mobile, and live providers. The local pinned Agent image and inspection review for the inlet is a separate next step. The broader #17 remains open. First mechanical CAD remains 8/10.

## Reproduce

Use Node 22.19.0, existing desktop Chrome and Playwright. Run the heavy checks serially and freeze the checkout during Studio.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs packages/barocss-cad/test/api-part.test.mjs
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle paired-tilted-outlet offset-to-plane offset-face-native native-offset-face feature-handles
pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1885_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/inlet" --inlet --replace
D1881_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/outlet" --replace
D1858_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/parallel" --inlet
```
