# D2157 — Refine exact drafted-sector rims on an inclined sketch

P4 [row 20](../../roadmap-rows/20.md) and [row 24](../../roadmap-rows/24.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `54edcc7e827f89ace9e2dfd2bddddaca97d1a531`.

The optional Draft sector detail now accepts a rotated original sketch plane. Each circular rim must have a unique original planar cap owner. Their two native circle centres define an axis. The rim and cap normals must be parallel to it, and each centre must lie in its own cap plane. The existing display tier then supplies one consistent packet to shading and picking. The native geometry, document and renderer code retain their original behavior.

## Verification

- **PASS, actual desktop baseline and final.** A 306.869898° sector, 10 mm high, has a −30° draft on a plane with normal (0, 0.6, 0.8) and translated origin (14, −6, 4) mm. At a 127.30 CSS px projected major radius, deviation from the independent projected ellipse drops from 0.55344 to 0.05378 CSS px. At 455.55 CSS px it drops from 1.98059 to 0.19246 CSS px. The top rim changes from 32 to 102 chords. WebGPU and WebGL2 select the same `{body: 0, edge: 3}` and agree on the shaded side. Native Save/fresh Open regenerates the same tier. The upright control retains both D2152 zoom results. Browser runs freeze 703 files and report no source changes or browser errors.
- **PASS, native identity and packet.** The independently placed cap centres are (14, −6, 4) and (14, 0, 12) mm. The unchanged native volume agrees with 5,087.767988706922 mm³ within 1e−7 mm³. Native B-rep and canonical mesh data compare exactly before and after detail generation. Refined edge samples match both incident face owners at both circular rims. A shifted rim centre or cap plane is refused for detail. The added packet is 183,608 bytes, within 192 KiB.
- **PASS, affected checks.** 11 Model and 112 Studio checks, Model and Studio types, scoped ESLint, browser syntax, diff check and production build pass. The independent geometry audit verified the exact placement and cap-ownership conditions.
- **NOT_RUN.** Unlimited zoom accuracy, other feature families, assemblies, section overlays, mobile and full local suites. The #608 HOLD stays in effect. #14 remains open. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/baseline" --tilted-sector --baseline
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/owned-tilted" --tilted-sector
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/owned-webgl2" --tilted-sector --webgl2
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/owned-upright" --draft-sector
node packages/barocss-cad-model/scripts/test.mjs cylinder-display arc-sweep-display display-edge mesh-wire extrude-draft-binding
pnpm --dir apps/cad-studio test display-mode viewport draft
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
