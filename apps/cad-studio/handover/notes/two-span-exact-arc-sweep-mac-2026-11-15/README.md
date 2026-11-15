# D1310 — Admit two co-circular spans for exact Sweep

2026-11-15 · P5, rows 07 and 30 · bounded native geometry qualification

One open 30°–120° circular rail may now use two rational quadratic spans on one carrier, including Studio Make curves output. Each input span must pass the common-circle, traversal and conservative whole-curve correction checks. Mixed circles, non-planar input, reversed travel at the join, incompatible weights or knots and three spans remain unsupported. The authored path is retained in the document; the canonical native carrier uses the existing linear tolerance.

## Independent Mac resumption

The existing six uncommitted D1310 files were preserved and reviewed at base `f2cf52ce661e5586ee66208c9472fb7d6b6cee61`. No cloud bundle was imported. Two additional Mac-authored regressions check rigid-world-transform mass/centroid and native reopen, and tiny versus excessive out-of-plane pole displacement.

- **PASS — retained desktop proof.** The original Make curves run applied the exact Sweep, refused a tangent bore, changed bore diameter from 2 to 3 mm, and saved/reopened the part and Sweep History. Receipt SHA-256: `a5cb6582141de24a86331b6e8eeaa86c1153f8aac0bc42eb40c3b1af60cc6008`. All 910 frozen runtime source hashes were compared with the local product source during resumption: no differences. Frozen, after-run and after-cleanup manifests have identical SHA-256 `bcde529eaafbb4ddd08793142b30993f020df0a58f99782e160baa8c6920e970`. The capsule does not include every test or type-only file.
- **PASS — visual review of retained screenshots.** Reopened bore and History screenshots show one solid, both bore mouths and Exact circular arc representation without an error banner. Vertical shading/edge bands remain visible; this is not general render-quality acceptance.
- **PASS — independent native measurements in that receipt.** Volume changed from 6317.431272067937 to 6142.700009206081 mm³ and matched after reopen; genus 1, eight faces, 18 edges and 12 vertices. Maximum sampled edge/surface gap 4.45e-15 mm; cap residual below 8.66e-15 mm. Native Save SHA-256 `987dcb1c070ec3dd6c2731c1b1f1b378af5cc93c1d1a2e949b8cee0e0e018e62`, semantic equality true. Zero page errors, console errors or observed source changes.
- **PASS — Mac focused checks.** Kernel type check, fast build and code shape; 14 exact-arc tests, retained bore-fillet test and seven Model arc-display/proposal-remap tests; focused lint. The new rigid-transform test checks volume and transformed centroid and native serialization.
- **PASS — final Mac gates.** Model and Studio type checks, Studio production build, final focused lint and diff whitespace check passed. Two static audit passes found no blocker. Removing the whole-curve correction bound and removing the total-angle clamp each caused the focused suite to fail; both mutants were killed and the generated module restored byte-for-byte.
- **PASS — fresh desktop replay.** Final Mac Make curves/agent proposal/Sweep/bore edit/Save/Open/History passed with 910 unchanged runtime sources and zero page or console errors. Native Save bytes match the retained run. Receipt SHA-256: `3044486dfdf2b0408bc9281eaefa6496246ee48cda4fb7b5ea37836d271381c9`. Reopened History screenshot was reviewed; shading bands remain.
- **FAIL — inherited aggregate docs drift.** The gate reports `_refusals.md` drift and the existing inventory mismatch at `coreResultChecks[0].directMembers.length` (44 expected, 46 actual), as recorded in D1309. No public API is added. Broad inventory regeneration remains a separate follow-up.
- **NOT_RUN.** Full suites, mobile, WebGL2, paid inference, arbitrary NURBS, three input spans, wider downstream modeling families and broad viewport quality.

The broad [Sweep issue](https://github.com/barocss/cad/issues/10) remains open. No whole-CAD percentage or broad manufacturing acceptance follows.

## Reproduction

Use Node 22.19.0 and serialize heavy commands with the existing gate.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/exact-arc-sweep.test.mjs packages/barocss-cad/test/arc-sweep-bore-fillet.test.mjs
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep sweep-agent-remap
pnpm --filter @barocss/cad-studio-app type-check
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
D1310_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs <external-evidence> --make-curves
pnpm --filter @barocss/library-docs check:docs
git diff --check
```
