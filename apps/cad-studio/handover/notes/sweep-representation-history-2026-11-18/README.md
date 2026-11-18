# #717 — Explicit saved straight Sweep representation

Qualification base: `3791fc386`. Dedicated standalone two-node numeric circle + terminal copied-path Sweep only. Stored mode is the existing native contract; there is no new kernel algorithm or schema. General exact Sweep #10 and every fitting/manufacturing/Physics HOLD remain open.

## Verified so far
- Original desktop Chrome baseline PASS: actual Line → Make curves → Sweep Faceted; History had readonly representation and no Edit Sweep. Undo/Redo and fresh Save/Open preserve the Faceted native result.
- New desktop flow PASS: Edit Sweep opens explicit Faceted (approximate) / Exact straight path choice. Cancel preserves source. Apply changes only mode, preserving profile/path/direct geometry/feature ID/outputs. Exact Undo/Redo, Save/fresh Open and reverse Faceted transition preserve the intended recipes.
- Independent exact oracle: disk r2, straight path [20,20,0]→[44,38,0], L30; V=120π, centroid [32,29,0], native cylinder radius/axis and two end caps, strict BRep. Faceted V374.5734182709618 is **not** asserted equal to the exact cylinder.
- Curved Faceted control: degree-2 middle pole moved +3 mm in Y, valid original solid. Exact transition refuses with the existing native straight-segment reason, Apply disabled; Cancel and Save/Open preserve accepted curved geometry. No fallback.
- Eight focused tests PASS: native straight degree1/2 and reversed direction, file roundtrip, unchanged IDs/outputs, no-op, invalid values/path/radius, foreign owner/in-place revision, metadata/downstream/associated/duplicate ID exclusion.
- Scoped lint and diff check PASS.

## First failure retained
The existing straight creation regression stopped waiting for the obsolete combined “path name · Exact straight path” label. On the unchanged qualification base, Path and Solid are already separate rows. Actual screenshot showed valid preview. Fixture labels only were corrected; the existing arc fixture had the same stale assumption and was corrected too. This failed run is not counted as a passed regression. Its later arc/type/build stages were NOT_RUN.

## Safety and limits
Only plain numeric XY circle plus terminal Sweep, with no additional document metadata consumers, linked route, arbitrary profile or downstream nodes. Optional original Direct curve must match the saved copied path; extra Direct objects excluded. Existing captured-document/worker ownership guard is reused; model tests also reject changed source identity/content. Face and edge identities may change, explicitly stated in HUD; no downstream identity support. No arbitrary NURBS/helix/twist or automatic migration. Full suite, mobile and independent external-reader interoperability NOT_RUN.

## Final local result
- Existing straight creation regression PASS for both Make curves and Edge as a curve, diameter editing, Undo/Redo and Save/Open.
- Existing exact circular arc regression PASS, including unsupported curve and oversized-profile refusal, diameter editing and Save/Open. The first arc attempt also expected the obsolete 90° error text; the unchanged base already advertises 120°. Corrected only that fixture expectation.
- First Model type check failed on an unregistered error code and test assertion narrowing. Corrected to the registered BAD_REFERENCE for the saved solid identity/validity guard and reordered test assertions. Native path/geometric refusals remain their original errors. Eight tests, scoped lint, Model type check, Studio type check/build and the complete new actual flow then passed.
- All certified browser runs have no page/console errors or source changes and confirmed context/browser/server cleanup.
- Final actual evidence was recaptured on the type-corrected source. Existing regressions ran before the error-code type fix; only that guard code string changed afterward, with full new actual and focused rerun.
- Exact commit CI will be linked from the issue. No full-suite claim.

