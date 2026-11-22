# D1644 — Cut a radial bore through an Exact semicylinder Thicken

P5, row 08. [#175](https://github.com/barocss/cad/issues/175) and [#368](https://github.com/barocss/cad/issues/368). Base `9cdbebbfd75d42ffcd2535c50bc2f381a0ae7064`.

Use the existing crossing-cylinder Boolean for one radial through bore. The native Thicken has radii 8 and 10 mm about [20, 20], with a 12 mm height. A circular Extrude along +Y runs from Y=25 to Y=33 at X=20, Z=6. The same subtractive feature uses both measured bore diameters.

- **PASS, actual Studio WebGPU.** Opened the two-operand file and used **Combine → Subtract**. Edited Diameter from 3 to 4 mm in the cutter's History editor. Undo restored the 3 mm document and Redo restored the 4 mm document. Native Save and fresh Open reproduced the edited nodes, one output and B-rep digest `1dc0009742da6551ec202b53576fa3c7a019760ebf354646ddd4b4b420b43ccf`. The run recorded six checkpoints, 1,164 frozen files and zero source changes, page errors or console errors.
- **PASS, native openings.** Both diameters have one strict closed solid, genus 1, with 8 faces, 10 loops, 30 edges and 24 vertices. The named inner and outer wall cylinders retain their radii and opposing outward senses. Each wall has one eight-edge inner loop. Each loop joins both inward cutter faces, with no cutter cap in the result. At 17 parameters on each rim edge, the maximum radial residual against both support cylinders was 5.33e−15 mm. Both rims include their expected crown witnesses at Z=6 ± bore radius.
- **PASS, independent volume.** Integrate the bore chords between the two positive-Y cylinder roots and subtract the result from `216π` mm³. The reference volumes are 664.3966041150337 and 653.2911147245767 mm³. Native and Studio volumes agree within 1e−8 mm³ at both diameters. The existing product path passed; this change adds a regression driver.
- **FAIL, resolved setup.** The first standalone probe used an invalid package name. The corrected probe evaluated both native results.
- **NOT_RUN.** Full local suites, WebGL2, off-center bores, other orientations and paid live runs. Faint lines are visible on the rendered wall. Rendering quality and selection overlays are outside this qualification and remain tracked by [#608](https://github.com/barocss/cad/issues/608). Both linked modeling issues remain open.

Use Node 22.19.0, installed Playwright and Chrome (`PW_DIR`, `CHROME`), the heavy gate and an output directory outside Git.

```sh
node --check apps/cad-studio/test/exact-cylinder-radial-bore-browser.mjs
pnpm exec eslint apps/cad-studio/test/exact-cylinder-radial-bore-browser.mjs
D1644_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-radial-bore-browser.mjs "$OUT"
git diff --check
```
