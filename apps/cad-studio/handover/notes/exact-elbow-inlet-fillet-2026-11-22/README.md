# D1672 — Trim and round the inlet of an Exact elbow

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `368a3248e6c240cc861dd7359b5dd98fc0035764`

Studio creates one clipping box, intersects the Exact elbow and rounds the new inlet by selecting the circular edge on the canvas. The selected display edge resolves to both native half circles. The box removes the first 5 mm of the straight lead. The other box faces stay clear of the body. The original outlet and both bend supports remain. The existing product path passes this scope. The changes add the browser regression and its record.

- **PASS, real desktop Studio WebGPU.** Box creation, Intersect and the Fillet preview use the Studio commands. A 2.5 mm fillet on the Ø4 mm elbow is refused and leaves the accepted cut unchanged. Apply 0.5 mm, then edit to 0.75 mm in History. The upstream diameter edit from 4 to 6 mm replays Intersect and Fillet with the same stored feature inputs. Undo and Redo pass for both edits. Save and fresh Open reproduce the edited native solid and the editable 0.75 mm radius. The run records 9 captures, 1,172 frozen files and zero source changes or page or console errors.
- **PASS, independent native geometry and worker read.** The clip leaves 633.545217716399 mm³ at Ø4 mm. The 0.5 mm round removes 0.636543358888 mm³ and leaves 632.908674357512 mm³. The edited Ø6 mm solid with a 0.75 mm round leaves 1423.328406025655 mm³ and retains two planar caps, two bend surfaces and two toroidal Fillet patches. The B-rep has one genus-zero shell with 10 faces and 18 edges. Cap and Fillet surface samples match their circular equations, including the inlet trim radius `r − f`, at 1e−7 mm. The strict native volume, independent native quadrature, and live worker agree with the independent volume formula within 1e−7 mm³. The reopened native B-rep digest is `4509b65a54f9c2ba891a28f4c200e06dc0d3c89d55daf1613fbdf5853df3eb5f`.
- **PASS, small verification.** Scoped ESLint, Node driver syntax and Git diff check.
- **FAIL, preliminary browser fixture.** After Open the driver tried Space while the Open control still had focus. The first Box run selected by an Extrude label. The real Box command names the body Box. The driver now blurs the focused control before opening the palette and selects the real body label. The final Studio run passed.
- **NOT_RUN.** Full local suites, production build locally for this test-only change, WebGL2, MCP proposal, wider clipping, and other rim profiles. Issue #10 remains open.

## Independent calculation

The cut volume is `πr²(19 + 10π)`. The first term is the remaining combined line length in mm. The second term is the length of the R20 mm quarter arc. A radius `f` round trims the inlet to radius `r − f`. Integrate the difference in circular area for the first `f` mm of the lead. The removal volume is `π[(2 − π/2)(r − f)f² + f³/3]`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/elbow-inlet-fillet-browser.mjs
node --check apps/cad-studio/test/elbow-inlet-fillet-browser.mjs
D1672_SOURCE_FROZEN=1 node apps/cad-studio/test/elbow-inlet-fillet-browser.mjs "$OUT/studio"
git diff --check
```
