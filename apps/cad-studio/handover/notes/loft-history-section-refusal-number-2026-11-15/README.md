# D1287 — Match Loft refusals to History section numbers

2026-11-15 · SMALL · P5, row 07 · [Issue #57](https://github.com/barocss/cad/issues/57)

A failed vertex match in the Loft under edit uses the displayed History section number. When the section source changed, the message names that source field. When the guide changed, it names the copied guide field. The affected picker has an invalid state and a link to its feedback. The kernel retains its existing indexing and tolerances.

- **PASS — desktop Studio.** Created a Loft from three 10 × 10 mm sections at Z=0, 10 and 20. The replacement guide crossing X=1 at Z=10 was refused as Section 2 and linked to Guide (copied). A top replacement beginning at X=1 was refused as Section 3 and linked to Section 3 source. Both refusals preserved the document. Reset restored the accepted choice and cleared the picker error. A valid 14 mm wide top section applied, preserved all earlier section copies and the saved guide, and survived Undo, Redo, native Save and fresh Open.
- **PASS — native and regression checks.** The accepted replacement and reopened Loft agreed with independent section integrals of 2,200 mm³ and centroid `(184/33, 5, 350/33) mm`. Native read confirmed one valid solid and all four unchanged middle-section corners. The existing endpoint refusal and duplicate guide draft switch still passed. Production build, focused lint and Git whitespace passed.
- **FAIL, corrected in verification.** The first browser run used the original Z=10 centroid after widening the top. The corrected test uses the first moment of the two intervals. Full-file lint on App.tsx reports the inherited unused `_k` in sheet bend settings. Focused lint on the edited helper, editor and browser driver passed.
- **NOT_RUN.** Screen reader, WebGL2, mobile, other section counts and orientations, and full local suites.

## Commands and evidence

Node 22.19.0 and the heavy gate. Desktop Chrome WebGPU 1440 × 1000. The primary run matched 905 frozen files through cleanup with zero page or console errors. Receipt SHA-256 `70ef8d6f75825f225855dede2590f84421d65e19221b16f9444e8e1c4ae27f03`. Guide regression receipt SHA-256 `055bb2d9e2da5f6b227b351f4360af88e63f17a9847e8c4d7e9fa38fe6f223ec`. Native Save SHA-256 `f8e9bb8a47f72d791c48df46e455bed67773347b3df9b622abaf6a925c60217f`.

```sh
pnpm exec eslint apps/cad-studio/src/app/failedFeature.ts apps/cad-studio/src/ui/NodeEditor.tsx apps/cad-studio/test/loft-history-section-replacement-browser.mjs
D1172_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-history-section-replacement-browser.mjs <external-evidence>
D1171_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-history-guide-replacement-browser.mjs <external-evidence> --check-duplicate
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```
