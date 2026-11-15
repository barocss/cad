# D1360 — Current gap-preview feedback

Completes barocss/cad#133. Base main `114ffb10c734ccab4733519f4a83f6e9b43ffbe5`.

## Change and boundaries

`usePathGap` offers a preview operation after its existing document/sketch/generation ownership read. `pathGapPreviewDraft` accepts only the exact expected current draft and clears its notice only for a valid plan. The viewport uses the returned draft identity in the preview, so clearing the notice does not hide the valid geometry. Invalid hover retains the refusal. Input-adjacent guidance now names moving away from line/arc endpoints or reducing Gap length; circle guidance refers to a point on its circumference. Native planner, application and IDs are unchanged.

## Verification

- Focused2/2 use native line/arc/circle planners and check valid/invalid preview, stale expected draft, null ownership result and returned identity. The existing hook ownership read remains unchanged; no new React lifecycle harness claim.
- Final Studio tsc, scoped lint, diff check and production build PASS.
- First actual Mac Chrome1024/1440 run PASS. Endpoint click refuses4mm gap and preserves document; invalid hover keeps the message. Hover at line center immediately shows both correct gap ends and removes the stale notice without editing geometry.
- Apply removes4mm along the slanted30mm line, retaining original e5/e6 ends. Draft Undo/Redo and document Undo/Redo pass. Stock rectangle remains exact; Extrude2 retains50mm³. Actual Save/fresh Open passes and does not retain preview.
- Root visually reviewed endpoint guidance and clean valid-preview screenshots.
- Receipt `d1360-first/receipt.json` SHA256 `281a075a51f6d3f1fac34307d970d63a26f58bdc9fb41236c1bf018207200021`; product source frozen throughout.

Circle/arc are planner/helper unit controls, not new browser qualification. No full-suite, CI or screen-reader claim. Existing HOLDs retained. Next D1361/#68, blank new parameter value and explicit input recovery.
