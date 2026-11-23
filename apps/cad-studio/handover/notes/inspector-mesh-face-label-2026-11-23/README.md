# D1813 — Label the display mesh face count in the Inspector

P0 Studio readout accuracy, rows 15 and 16. Related evidence in [issue #10](https://github.com/barocss/cad/issues/10). Base `ec18b989eb02ea5cea5460e02aed2ffaf3874876`.

Label the selected body's display mesh face count as `Mesh faces`. The Inspector receives and displays the evaluated mesh count in the existing body row.

- **PASS — original ambiguity reproduced.** The D1812 actual Studio capture reads `Faces 32` for the verified exact S-bend. The display mesh has 32 face groups and the native B-rep has 50 faces.
- **FAIL — corrected browser harness.** The first two desktop runs verified the S-bend before and after fresh Open. The control Box step first failed to open the command palette. The second attempt encountered the default sample document. Explicit New part and the Box keyboard shortcut allowed the complete control to pass.
- **PASS — actual desktop Studio WebGPU.** The S-bend displays `Mesh faces 32` before Save and after fresh Open. The native count is 50 and the native body SHA-256 is `7dddf8c18a08523f7f9bf6d7ee9f44dc5f9012ac5b7d3b9c3e4d4c656c112acf` in both states. A new 12 × 10 × 8 mm Box displays `Mesh faces 6`. The mesh and native Box counts both equal 6. Five desktop checkpoints record zero source changes and browser errors.
- **PASS — SMALL checks.** Both body-topology-label tests, scoped ESLint, Studio types, browser harness syntax and Git diff check pass.
- **NOT_RUN.** Full local suites, local production build, alternate viewport backends, mobile and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured.

Use Node 22.19.0 and the heavy gate. In desktop Studio, open the saved [D1812 result](../exact-four-span-paired-s-bend-2026-11-23/README.md) and select the Sweep body. Read the Inspector row, Save and fresh Open the file and select the body again. For the control, start New part, press B and apply the Box with Width X 12, Depth Y 10 and Height Z 8 mm. Select Box. Compare the Inspector values with the evaluated display meshes and the strict native B-rep counts.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test body-topology-label
pnpm exec eslint apps/cad-studio/src/ui/SelectionInspector.tsx
pnpm --dir apps/cad-studio exec tsc --noEmit
git diff --check
```
