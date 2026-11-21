# D1553 — Isolate shading and line contributions on the saved Smooth Screw

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 5c99e8fc4a0062cccf91c1c2945fb0b84354f0ca.

Use the D1552 approved −450° external-axis Smooth Screw. Hold the saved document, exact native body, viewport size and camera fixed. Compare the actual AO toggle on both desktop backends. Use isolated development-response probes to change one of the Model ground shadow, generated silhouette lines, native display lines or sample density at a time. The probes leave the source and saved file intact.

- **PASS, AO in desktop Studio.** Turning AO on changes 42,161 of 77,758 measured foreground pixels in WebGPU and 44,327 of 62,385 in WebGL2. Turning AO off restores all pixels in the 430 × 520 comparison crop. The broader stripes change with AO. The small dark marks near both inner creases remain visible with AO off.
- **PASS, isolated lines and shadow.** The WebGPU Model ground shadow switch changes 35,645 crop pixels, with 111 sampled foreground changes and at most one foreground pixel in the two crease patches. Its default and restored views match exactly. Disabling the generated silhouettes changes zero crop pixels on WebGPU and 565 on WebGL2. Disabling native display edge lines changes 4,893 crop pixels on WebGPU and 5,053 on WebGL2. The visible crease marks persist with either line layer disabled separately.
- **PASS, isolated display density.** At the original camera with AO off, changing the optional display packet from 1,092 to 2,182 triangles changes 27,306 of 77,923 sampled WebGPU foreground pixels. The inner marks change location or intensity and remain visible. This measures a sampling influence. It does not yet locate the cause of the remaining marks. The underlying 362-triangle canonical packet, saved document and strict native digest c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661 compare exactly.
- **PASS, affected checks.** 29 Studio tests, scoped ESLint, browser syntax and Git diff. The final browser receipt has zero runtime errors, console errors and frozen-source changes.
- **FAIL, corrected probe.** The first native-line probe failed to match the development response formatting. The final probe checks a whitespace-tolerant match before using that response.
- **NOT_RUN.** Native surface depth and triangle coverage at the dark spots, a production correction, mobile and full local suites. #630 remains open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and keep evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/smooth-screw-display-browser.mjs
node --check apps/cad-studio/test/smooth-screw-display-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode silhouette
git diff --check
SCREW_DISPLAY_FROZEN=1 node apps/cad-studio/test/smooth-screw-display-browser.mjs "$EVIDENCE" "$D1552/agent-approved-smooth-screw.bcad"
```
