# D2259 — Retain sharp rails at an opposed plane-to-surface joint

P2 [row 11](../../roadmap-rows/11.md) and [row 30](../../roadmap-rows/30.md) · [#779](https://github.com/barocss/cad/issues/779) · Base `c7bd42b17`.

- **FAIL, reproduced on main.** The original complete elevated cubic arch is a strict-valid solid of approximately 2,500 mm³. The default projection had no `rail-a` or `rail-b` in Front, Iso or Right. Explicit tangent mode returned both Front and Iso rails with the wrong tangent classification. Actual Studio showed the missing outlines.
- **Decision.** Use the signed alignment of an oriented analytic plane normal and an oriented sampled surface normal. The absolute alignment of the original near-opposite normals was mistaken for a smooth joint. The other classifiers and occlusion rules remain as before. In particular, the cylinder radial normal in this classifier is unsigned.
- **PASS, source and geometry.** Independent source-coefficient derivatives give −0.9950371902099892 and −0.9950371902113252 against the q12 smooth threshold +0.9807852804032304. The positive control hull lies in Y≥0. The Front and Iso rays leave that half-space at both open rails. The original coefficient, sense, mass and tolerance data match before and after. Front and Iso show both complete lines, Right shows the near rail, and Top remains end-on. A real foreground box hides the selected midpoint. The same rear box leaves it visible.
- **PASS, actual Studio and independent images.** Studio displays all four views from the original STEP bytes. Project Save, Close and fresh Open retain the same geometry and drawing. Each successful Studio run matched 1,433 frozen sources and had zero console errors. The actual native bytes match before and after. An independent SVG reader and RGB PNG reader find the 15 original line witnesses after correction, with zero dark witnesses in default before. In the independent Projection consumer, an isolated `33db12e8` snapshot with the issue's four pinned runtime geometry files and the identical classification change passes all four tangent/face-guide combinations. Its eight SVGs and eight CPU PNGs match the verified default outline, including both guide styles.
- **PASS, knot-inserted representation.** Repeated the complete second constructor in the issue follow-up. Its full degree-2 carrier with five poles and double knot at 1/8 has the same before and after rail counts. Both independent SVG/CPU readers and the legacy Projection guide controls passed for this input as well. Actual Studio opened the retained knot-inserted STEP and kept the restored rails through project Save and fresh Open.
- **PASS, affected checks.** Node 22.19.0, 29 focused Kernel and 19 Model tests, Kernel/Model/Studio types, affected lint, Studio build, whitespace. Full Kernel: 3,339 passed, zero failed, two existing skips.
- **FAIL, corrected harness.** The first Studio harness compared unnormalized drawing seed JSON. The second uses the accepted loaded drawing and asserts the STEP bytes and four views. An initial PNG reader expected RGBA. The independent final run checks the actual RGB bytes. No product source change was made for these harness failures.
- **NOT_RUN.** Mobile, full local Model/Studio suites and unrelated generalized silhouette families.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
(cd packages/barocss-cad && node --test test/balanced-quadratic-mass.test.mjs test/brep-hidden-line.test.mjs test/balanced-quadratic-cap.test.mjs)
(cd packages/barocss-cad && node --test test/*.test.mjs)
node packages/barocss-cad-model/scripts/test.mjs drawing-made-views drawing-diameter-read drawing-cylinder-diameter drawing-bore-regeneration chat-drawing
bash "$OUT/desktop.sh" 00b baseline
bash "$OUT/desktop.sh" 01
git diff --check
```
