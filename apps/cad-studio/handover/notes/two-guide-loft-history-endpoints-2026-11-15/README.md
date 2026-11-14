# D1281 — Identify both Loft guides in History

2026-11-15 · FEATURE · P5, row 07 · [Issue #547](https://github.com/barocss/cad/issues/547)

History shows the two saved endpoints next to each guide's middle X and Y inputs, in millimetres. When a gap check fails for the Loft under edit, History marks both X inputs and names them in the correction message. Both axes describe the corresponding endpoints. Only the two X inputs describe the gap error. Editing a field clears the prior error.

- **PASS — desktop Studio.** With 10 × 6 mm sections at Z=0 and Z=12, History displayed the endpoints at X=0 and X=10. Changing Guide 1 middle X from 2 to 14 showed a gap refusal with warning borders and `aria-invalid` on both X fields. The Y fields kept their regular borders. Guide 2 retained X=14, and the accepted document stayed equal to the original. Applying Guide 1 middle X=3 changed the volume from 819.84 to 768.96 mm³ and retained Guide 2's saved control points. Undo passed. Editing Guide 2 separately, saving, and opening a fresh Studio context kept both endpoint labels.
- **PASS — unequal rectangle and native checks.** The same 10 × 6 to 14 × 4 mm taper from D1280 still passes the independent section volume, centroid, inertia, and guide-contact checks. After fresh Open, Guide 2 displayed `(10, 0, 0) → (14, 0, 12) mm`. The congruent Loft remained one strict closed solid with six faces. Its desktop and independently calculated volumes agreed within 3e-13 mm³ on all four accepted states.
- **PASS — controlled checks.** Model type check, Studio TypeScript and production build, lint for edited sources and tests, and Git whitespace check passed. Both desktop runs used 1440 × 1000 Chrome with WebGPU. The frozen files matched after cleanup, with zero page or console errors. Screenshots confirmed the gap warning borders and the unequal endpoint display.
- **FAIL — none in the final checks.**
- **NOT_RUN.** Screen reader, WebGL2, mobile, nonrectangular sections, full suites, and paid inference.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. Congruent Loft receipt SHA-256 `dda0c37ff239e48821438b63aac7ff031492cc14b792346450f49422abc5ac13`, 904 frozen files. Unequal Loft receipt SHA-256 `2ef771875532818feb3152fc4211548a22597337c342942a1bc8f562d71f62ae`, 903 frozen files. Congruent saved file SHA-256 `ce198c3aaafffc49acde2f1b44460e94da9abd4798bbb4826ae1308a5179cf3f`.

```sh
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
pnpm exec eslint apps/cad-studio/src/ui/NodeEditor.tsx apps/cad-studio/src/ui/FeatureFailureNotice.tsx packages/barocss-cad-model/src/engine/errors.ts apps/cad-studio/test/loft-two-guides-browser.mjs apps/cad-studio/test/two-guide-loft-taper-browser.mjs
D1275_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-guides-browser.mjs <external-evidence>
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs <external-evidence>
git diff --check
```
