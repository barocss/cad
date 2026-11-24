# D1890 — Complete the original measured sketch gap closeout

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md), [#226](https://github.com/barocss/cad/issues/226). Base `5c8fb5a9e601497be9b1e4be1d1b74108caf9a48`. This adds actual desktop evidence for the existing product.

- **PASS, actual desktop.** Eight states. A constrained construction source with a stored 30 mm length and two ambiguous overlapping sources do not offer measured Gap. Their geometry, draft history and accepted document remain intact. Switching from Trim to Select retires the active preview. Hiding the current construction source retires the preview in the same document. The old canvas point adds no edit, and showing the source again requires a new measured preview. Adding an ordinary crossing at X32 does not change the requested endpoints near (30.4,27.8) and (33.6,30.2). Both new ends match the projected references after Apply, the crossing remains and one draft Undo/Redo replays the gap.
- **PASS, scoped checks.** 26 Studio tests and focused lint. The existing numerical tests cover positive and negative arc sweeps, the circle seam, invalid lengths and near-coincident endpoints.
- **FAIL, early harnesses.** The first expected the stock outline to remain in the parked DOM class after selecting the tool. The next expected the same DOM order after replay even though the same material geometry moved between active and parked slots. The final checks use comparable geometry and separately verify draft and accepted document state.
- **NOT_RUN.** New local production build for this test-only change, whole local suites, mobile and wider profile families. The first mechanical CAD baseline remains 8/10.

## Original finite issue acceptance

- [D803](../construction-line-path-gap-2026-11-12/README.md), [D802](../construction-arc-path-gap-2026-11-12/README.md) and [D804](../construction-circle-path-gap-2026-11-12/README.md) cover native line, arc and circle gap geometry, refused inputs and file/history behavior. D803 also covers replacing the document while the preview is live.
- [D805](../ordinary-line-path-gap-2026-11-12/README.md) and [D807](../ordinary-arc-path-gap-2026-11-12/README.md) cover material role, Finish refusal and explicit Make curves. [D806](../ordinary-circle-gap-close-2026-11-12/README.md) and [D1137](../reopened-circle-gap-repair-2026-11-14/README.md) cover explicit repair, Extrude and saved native results.
- [D824](../tilted-circle-gap-reference-2026-11-12/README.md) covers a translated tilted plane and the surrounding driving dimension and side identity. [D1074](../sketch-circle-gap-draft-history-2026-11-14/README.md), [D1136](../reopened-circle-gap-2026-11-14/README.md) and [D1360](../path-gap-feedback-mac-2026-11-15/README.md) cover draft Undo/Redo, source ownership and current refusal feedback.
- D1890 closes the remaining target constraint, overlapping source, live draft ownership and crossing cases after exact successful CI and confirmed actual scene attachments. A gap spanning multiple segments was stated as a follow-up to the original minimum. It does not enter this closure.

## Reproduce

Use Node 22.19.0, existing desktop Chrome and Playwright. Run heavy checks serially and freeze the checkout during Studio.

```sh
pnpm --dir apps/cad-studio test linePathGap arcPathGap circlePathGap path-gap-preview
D1890_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$OUT/contract" --contract
```
