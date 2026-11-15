# D1377 — native G2 copy and Sweep path geometry

Follow-up to #151 / D1376, addressing #152. The native copy implementation is unchanged. Sweep now describes the stored path as Line, Polyline or Degree N NURBS. The result's Faceted/Exact representation is separate in both the command and History. The stored path coefficients, source objects and recipes are not rewritten.

A degree-one path alone does not establish approximation provenance: it can be authored intentionally. Legacy curves therefore say Polyline, not an invented approximation claim. D1376 retains explicit Display approximation for its circular display fallback, and refuses arbitrary unowned sampled-polyline copying. Exact native lines/arcs/G2 curves gain no approximation label.

## Verification

- Focused geometry label / History output tests 2/2 PASS; no mutation of supplied recipes.
- Model/Studio typechecks and scoped lint PASS; production build PASS. Combined native-copy / closed-path feedback / label regression 7/7 PASS.
- Actual Chrome 1024×900 and 1440×900: G2 native n2_e13 copy keeps degree4, exact coefficients/endpoints and varying nonzero curvature. Exact line and R4 semicircle controls retain curvature0 and0.25. Originals, Undo/Redo and downloaded Save/fresh Open pass.
- Both copied native G2 and independently sampled nine-point polyline control sweep a Ø0.16 circle. Preview/apply, distinct path labels, separate Faceted solid representation, History, strict B-rep, original body/direct preservation and Undo/Redo/Save/Open pass. The sampled control is not claimed byte-identical to the historical display copy.
- Final receipt SHA256 `1251c1f7e0820044f703304f81fe047fd43a6c2d9d0afc14f037c422d17b4584`. Actual G2-copy1024 and polyline-Sweep-History1440 pixels reviewed; original/native-Sweep-History1024 reviewed too.
- Initial test harness used unsupported .test.tsx discovery, then bundled React browser SSR kept a runtime handle open. The final test inspects the pure component output without SSR and exits with 2/2 PASS.
- Initial browser fixture serialized a tiny control point in exponent notation, which the parser correctly refused. Second used the G2 control polygon, not points on the curve, and correctly hit a non-manifold Sweep refusal. Third sampled curvature at a semicircle internal knot, correctly refused by the native D2 continuity gate. Final driver uses decimal literals, nine native curve samples for the polyline control and interior-span curvature parameters. No parser/geometry/continuity gate was changed.

Existing broad API inventory drift, prior hook-suite baseline failures and HOLDs remain. No whole-CAD, whole-suite, CI, assistive-technology or Loft claim. Native fillet creation is a generated fixture Open, not UI Fillet authoring evidence.

## Completion boundary

#152 remains open for legacy approximation provenance. New native G2 copies are exact and current Sweep representations are distinct. The historical degree-one object has no reliable stored source relationship: automatically marking every degree-one curve as an approximation would mislabel authored lines/polylines. A safe provenance-aware legacy recovery needs a separate design/acceptance decision, not guessing from degree or a user-editable name.

## Aggregate docs gate

`check-docs.mjs` FAIL: generated `_refusals.md` differs, canonical inventory IV001 core-result direct member length expected44/actual46, and `studio/sketches.md` still names the absent `Cannot offset` label. These are not silently regenerated or waived. This change adds one Model app helper export, adding to the already recorded unresolved inventory surface; no whole-docs PASS is claimed.

- Refreshed long-name Sweep History browser regression PASS, receipt `e08fb6852606ec2cf97bcc5f94390b70ab6f1d0a40d23beb130607b5f3e4455b`: wrapped path/focus, Enter/Delete preservation, diameter6→8, native bounds, independent source edit, Undo/Redo/Save/Open. Actual narrow History pixels reviewed. Clipboard copying is NOT_TESTED by this driver.
