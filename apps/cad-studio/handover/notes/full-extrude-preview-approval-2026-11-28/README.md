# D2166 — Approve the complete Extrude and Fillet result once

P1 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md) · [#203](https://github.com/barocss/cad/issues/203) · Base `78fb6de3726bf2adbe58ed20493039901ec92f28`.

The existing desktop workflow satisfies the proposed one-part acceptance. D749 already established native refusal attribution and response ownership for this fixture. The extended desktop driver measures the remaining positive drag and full-preview boundaries on the same 40 × 30 mm rectangular sketch, Extrude 20 mm and downstream Fillet R8. Only the test driver changes.

| #203 criterion | Evidence |
| --- | --- |
| A · Same input | **PASS.** Actual handle drag snaps to 18 mm. Direct numeric entry of 18 mm produces the same entire authored document and the same evaluated body. The retained radius and original edge identity match. |
| B · Prefix and full preview | **PASS.** A 160 ms timing hold on an unmodified three-node Worker reply selects the slow branch. During the next drag the Worker returns the 18 mm two-node prefix at revision 34. Studio shows its square edge with `evaluating…` and disabled Apply. The three-node preview at revision 35 includes the Fillet. |
| C · Refusal and accepted state | **PASS.** The 4 mm prefix alone is valid at 4,800 mm³. Full native regeneration refuses `RADIUS_EXCEEDS_FACE` at original Fillet `n41`. The visible document, History, selection and accepted R8 shape stay at 20 mm until an approved full candidate. |
| D · Retire context | **PASS.** Actual withheld Worker failures retire after value changes, 4 → 12 → 4 emits a new request, Cancel and same-ID Open discard old attribution, and confirmed New followed by a different command leaves its own HUD exclusive. Only delivery timing is controlled. |
| E · Apply and persistence | **PASS.** Two Enter requests while the full preview is pending leave the accepted document untouched. Once the exact full result arrives, one commit gives 21,187.964473723 mm³. One Undo returns to the original. Redo restores the complete candidate. Numeric parity, browser-project Save and fresh Open retain the exact document. |

Independent volume is `1200h − 30 × 8² × (1 − π/4) mm³`. Saved document SHA-256 is `f83e384cfe223298d6fe3fc31ee8b3a91bb75276a860cc9ab61b33842b8c5da3`. Desktop Studio WebGPU recorded zero page errors, console errors and writes across 1,283 frozen files.

- **PASS.** The complete actual desktop flow, 14 affected Studio checks, driver syntax and diff check.
- **Corrected first runs.** The older driver omitted the current New confirmation while a feature draft was active. The next attempt used the wrong dialog role. The final run confirms Discard changes and then delivers the old Worker reply to the new context.
- **NOT_RUN.** Broader feature families, full local suites, type check and production build for this test-only change, and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
D749_SOURCE_FROZEN=1 node apps/cad-studio/test/failed-feature-preview-browser.mjs "$OUT/run3" --prefix-approval
pnpm --dir apps/cad-studio test failed-feature command-apply o9-lanes feature-mode-exit
node --check apps/cad-studio/test/failed-feature-preview-browser.mjs
git diff --check
```
