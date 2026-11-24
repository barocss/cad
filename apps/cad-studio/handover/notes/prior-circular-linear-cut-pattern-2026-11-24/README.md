# D1901 — Repeat an original circular through-Subtract on a signed XY line

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `882f5e4351492cfbc88f3917f4e03d82fff3ac93`.

Reuse the current Linear cut-pattern command for an original circular through-Subtract followed by one original rectangular through-Subtract. The source stock must be an original upright rectangular extrusion. Certify the full-height native source and later cavities, their carrier and line ownership, and the clearance for each signed XY copy before applying the existing Boolean operation. The local Agent description exposes the same bound.

- **FAIL, previous desktop Studio.** The earlier circular source was selected but the geometry preview refused it as outside the rectangular source family. The document and history were intact.
- **PASS, desktop Studio.** Seven actual WebGPU states and seven earlier three-cut rectangular control states passed. Original Subtract `n4` and current target `n7` stay distinct. X +8 mm makes one new aperture. X +4 mm, X +12 mm, X +16 mm and Count 3 at X +8 mm each refuse. The four attempts preserve the document and Undo/Redo availability. History changes X +8 mm to X −6 mm. Undo and Redo recover the positive and negative layouts. Native Save and fresh Open retain the source, target, spacing and native topology.
- **PASS, independent expected geometry.** The 60×40×10 mm stock has two R2 circles and one 4×2 mm rectangular through-hole. Strict output is one shell of genus 3, with 14 faces, 20 loops, 72 coedges, 36 edges and 24 vertices. Both caps have three inner loops. The two circular rims each use two exact arcs. The copied center changes from `(18,10)` to `(4,10)` mm. The rectangular wall and original circular wall retain their native names. Volume is `23920 − 80π = 23668.672587712816` mm³. The negative-spacing centroid is `(30.257747047706097, 20.143365628566485, 5)` mm.
- **PASS, affected checks.** 99 Kernel, 35 Model and 4 Studio focused tests. Kernel and Model type checking, focused lint and the Studio production build passed. The Kernel cases include signed X/Y, count 64, unchanged omitted-source behavior, native pcurves and refusal of changed source families. The first focused attempt exposed a missing hole-loop tag in a negative test fixture. Adding its literal tag let the test reach the policy check. Kernel type checking also passed after correcting the working directory for its command.
- **NOT_RUN.** Whole local suites, paid Agent providers, other circular source chains, general dependent-reference recovery and mobile. #25 remains open. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/*cut-pattern*.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern toolset tool-contract
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp
pnpm --dir apps/cad-studio build
D1901_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-linear-cut-pattern-browser.mjs "$OUT/base" --baseline
D1901_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-linear-cut-pattern-browser.mjs "$OUT/studio"
D1850_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/rectangular-control" --linear-three
git diff --check
```
