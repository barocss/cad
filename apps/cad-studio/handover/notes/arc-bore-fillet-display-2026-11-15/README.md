# D1304 — Refine the outside of a circular Sweep after a bore fillet

2026-11-15 · FEATURE · P4, rows 05, 06 and 20

The D1302 fitted fillet used the canonical display mesh. Increasing global tessellation from quality 8 to 12 took the measured packet from 406,576 to 1,051,440 bytes at the 0.25 mm radius. Most triangles were inside the bore. The new packet replaces the four unchanged outer walls and both cap triangulations. It refines their shared outer boundaries and uses the existing quality-8 inner-loop samples for both caps. The bore and blend triangles, far rim and canonical owner tables stay in place. The Worker sends the replacement buffers with the existing mesh token. Studio composes them once for each mesh it displays.

- **PASS — desktop Studio WebGPU.** The Top Ortho inside and outside contours at 64.012 CSS px/mm measured 4.080 → 0.173 and 2.396 → 0.204 CSS px. At fit the changes were 1.305 → 0.055 and 0.766 → 0.065 CSS px. Screenshot probes located fill and background. An actual pointer click selected body 0, edge 2. The 52-segment highlighted edge had 0.095 CSS px maximum chord error before and after the Fillet History edit from 0.20 to 0.25 mm and native Save/Open. The same volume checks passed in both arms.
- **PASS — retained cap contact.** At Front Ortho zoom, 97 rays bracketed the fitted cap contact at each radius. Deviation from the independent ideal rolling-ball contact was 0.260 CSS px at 0.20 mm and 0.349 CSS px at 0.25 mm. The refined packet reproduced the same measurements and kept the tangent contact unselectable. Model tests verify that every shared inner loop segment has one triangle on each side. The far circular rim uses its original sampled edges and owners. The bore and blend triangles, positions, and normals match the original tessellation exactly.
- **PASS — focused tests and transfer.** 11 Model tests and the Model type check passed. The two sparse packets use 114,816 and 114,712 bytes. Tests check composition, the existing owner tables, exact buffers at both cap joins, native volumes, Worker transfer, and zero additional buffers on token reuse. Focused lint, Studio production build and whitespace checks passed.
- **NOT_RUN.** Additional refinement of the fitted mouth itself, nonconstant fillets, cut or end-rim fillets, arbitrary zoom, perspective accuracy, WebGL2, mobile, and full local suites.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. The baseline bypasses only the viewport's sparse packet choice. Both runs matched 408 frozen sources after cleanup and recorded zero page errors, console errors or file changes. The saved document hash matches between arms.

| Desktop run | Receipt SHA-256 |
| --- | --- |
| Canonical mesh | `e76e8221b9fd288b4ea7e33e1e4f5a976c72e12cf27acad6297d0f061d422c70` |
| Refined mesh | `9140d6f955a767b8e4e7253146f67be7a352b5831aee1de5d37d008841203264` |

Native Save SHA-256 `3c5b752eaed8995549d1d0df45ff18abe67a21599fa4c7a76ffd4bb114cf0880`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep cylinder-display meshWire
D1304_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-fillet-display-browser.mjs <external-baseline> --baseline
D1304_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-fillet-display-browser.mjs <external-product>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```
