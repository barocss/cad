# D2215 — Explain invalid SubD Torus and Tube radius order

P1 [row 07](../../roadmap-rows/07.md) and [row 16](../../roadmap-rows/16.md) · [#767](https://github.com/barocss/cad/issues/767) · Base `6708c4599`.

The shared SubD recipe validation keeps the same dimensions, cage limits and `PRIMITIVE_SIZE` code. It names the relevant radius pair when the inner value equals or exceeds the outer one. An invalid subdivision count has its own whole-number notice.

- **FAIL, original desktop.** History refused Torus Tube radius 13 or 12 mm with Ring radius 12 mm, and Tube Inner radius 13 or 12 mm with Outer radius 12 mm. Both displayed the generic finite-dimensions and cage-count message.
- **PASS, actual desktop.** History named the two radii for each shape. Apply stayed disabled for the reversed or equal radii and for a fractional or out-of-range count. Valid values restored preview and Apply. Cancel preserved the exact document and cage. A separate Apply changed only the intended radius, 3 → 4 mm for Torus and 8 → 7 mm for Tube, while retaining the source feature ID. Undo and Redo restored the expected documents. Chrome recorded 708 frozen sources and zero page errors, console errors or downloads.
- **PASS, affected checks.** 20 Model tests, including the existing Torus and Tube checks and equality and subdivision inputs. Scoped lint, Model type-check and whitespace passed.
- **FAIL, first verification attempts.** The browser test initially read the count notice before evaluation completed. The first type-check required an explicit `Values` annotation for the test fixtures. The corrected verification passed.
- **NOT_RUN.** Full local suites and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh" desktop-before-final --baseline
bash "$OUT/run.sh" desktop-fixed
pnpm --dir packages/barocss-cad-model test primitives
git diff --check
```
