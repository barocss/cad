# D2269 — Finish the exterior cone-to-plane rim of the closed trapezoidal Sweep

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#12](https://github.com/barocss/cad/issues/12) · Base `00442a913`.

- **Decision.** Use the existing coaxial constant circular Fillet on the two native outer-rim halves where the conical wall meets the cap. Direct native execution and Studio agree. Product code required no change.
- **PASS, native geometry.** At authored widths 4 and 6 mm the original rim radii are 22 and 23 mm. For `k = (w−2)/6` and Fillet radius `r = 0.5` mm, the cap setback is `r(√(1+k²)+k)` and the toroidal meridian centre is `(R − setback, 3−r)`. Fifty native face samples per shape match that meridian within 1e-7 mm. The two valid genus-one results retain eight faces and sixteen edges. Independent annular-section integration gives 2,196.585152696606 and 2,862.203279297451 mm³, within 6e-8 mm³ of the native mass results.
- **PASS, desktop.** One original canvas pick and the existing tangent expansion identify both rim halves. Studio rejects the oversized 4 mm radius, previews and cancels the 0.5 mm Fillet with the accepted source intact, then applies it. The upstream width edit keeps both original Fillet edge owners and refreshes their match signatures from X22 to X23. Undo, Redo, project Save, Close and fresh Open reproduce the edited native result. The final run froze 1,308 source files and recorded no console errors.
- **NOT_RUN.** Wider vertex, setback and multi-face Fillet cases. Full local suites for this evidence-only change, mobile and live models.

```sh
node "$OUT/native.mjs"
bash "$OUT/desktop.sh" first
git diff --check
```
