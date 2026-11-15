# D1320 — Ruled endpoint correspondence and folded-surface refusal (#501)

## Bounded implementation

The existing two-curves section lists evaluated starts/ends and the start-to-start, end-to-end rule. A display-only test for separated, approximately straight monotone-control pairs running in opposite parallel directions warns that connections **may** cross and fold. It points to selecting one curve and Reverse; swapping the pair alone does not reverse either curve. This is not a general intersection/admission algorithm, and it never changes geometry or blocks native creation.

The exact native Thicken cause `the surface has no normal at a point (it is degenerate there)` now gets the undefined-normal explanation before the generic outline rule. It explains why lower thickness does not repair a fold and retains raw detail. No native guard changed.

Sources: Studio `ui/ruledEndpointCorrespondence.ts`, `ui/TwoCurveRoles.tsx`; Model `engine/errors.ts`. Tests: `ruled-endpoint-correspondence.test.ts`, `ruled-fold-guidance-browser.mjs`.

## Independent Mac evidence

- Authored quadratic line fixture; actual public Reverse creates the opposite-direction source. Before creation, the endpoints and crossing warning are visible. Swap leaves warning and document unchanged.
- Actual Ruled creation makes the folded surface. Thicken2 and1 mm both refuse with undefined-normal guidance, disabled Apply, document preservation and Cancel recovery.
- Native Save/fresh Open preserves the folded file and reproduces the same refusal.
- Saved-file recovery explicitly hides the folded surface/reversed copy, shows and selects the preserved original matching-direction curve, and makes a new Ruled surface. This is **not** a claim that the recovery used a second Reverse action.
- Recovered normal2 mm Thicken passes strict B-rep,800 mm³,Z0…2; Undo/Redo and Save/fresh Open/native reinspection pass. Original source and hidden folded surface remain present.
- Initial1024 and fresh1440 desktop contexts; initial guidance and reopened refusal screenshots visually reviewed. Final source-frozen receipt SHA256 `ccb0360e240556582bbd6d36ddfb51e74664d4b1a1600b0e815b1d317b84731e`.
- Unit3/3 (including curved/nonparallel/collinear negative cases), Model/Studio type-check, focused lint, production build and independent review PASS. Final wording and negative tests reran unit/lint/browser; no native code changed.

## Limits / next

Display threshold is relative1e-9 and is not a geometry tolerance guarantee. General weighted/nonplanar UI, native Make curves producer in this driver, AT/mobile and full suites NOT_RUN. Existing App `_k` lint and generated-doc drift remain separate. All HOLDs persist. Next D1321/#550: investigate overlapping cage element depth selection and explicit back-candidate control, with Box/Smooth desktop parity before completion.
