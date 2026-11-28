# D2267 — Review a sealed trapezoidal Sweep cavity edit through the local Agent

P5 [row 04](../../roadmap-rows/04.md), [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `289f9e1ca`.

- **FAIL, base capability.** The real stdio Agent could stage the cavity parameter change and report its net volume delta. The pending proposal had no model review revision, and pinned visual review returned `MODEL_REVIEW_UNAVAILABLE`.
- **Decision.** Recognize one named cavity wall parameter in the default-plane exact closed Sweep. Reuse the existing pending image, revision and face inspection contract. Certify both real native B-reps, the same exterior shell digest, all eight cavity face owners, inward plane and cylinder directions, and the whole cavity position. Check the analytic annular volume against exterior minus net native volume. The existing user approval gate owns the edit.
- **PASS, local MCP.** The reviewed parameter moves from 1.5 to 2 mm, the radial width from 1 to 1.5 mm, and axial height stays 2 mm. Cavity volume grows from 238.761041672826 to 362.853951489622 mm³. Net material volume falls from 1,972.920186454386 to 1,848.827276637589 mm³. Both agree with independent annular volume. Pinned image and face reads agree. A wall crossing, stale base and stale image pin refuse. An Agent acceptance attempt leaves the pending document unchanged.
- **PASS, actual desktop.** Studio opened the pending proposal, Preview and Hide kept the original part, and the user Accept action installed the same native candidate digest. Undo and Redo kept the proposal history. The native geometry and original authored feature persisted after project Save, Close and fresh Open. The Y section shows the accepted sealed cavity. The run froze 1,310 sources with no console errors.
- **PASS, automated.** Node 22.19.0 passed 68 Model and 19 Studio cases. Model and Studio types, affected lint and the production Studio build passed. The first baseline locator expected the kernel message instead of the real formatted refusal. The corrected baseline verifies the observed user-facing message and unavailable review.
- **NOT_RUN.** Live model calls, general cavity edits, other scene owner scopes, mobile and the full local kernel suite for this Model-only change.

```sh
bash "$OUT/baseline.sh"
bash "$OUT/desktop.sh" first
bash "$OUT/validate.sh"
git diff --check
```
