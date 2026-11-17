# Rectangle finishing feature height edits (#648)

## Scope and contract

An existing plain three-node rectangle → Extrude → one terminal numeric constant circular Fillet or equal-distance Chamfer can change **only Extrude height**. The new route first proves all eight native corner roles, twelve edge roles and six face roles, incidence and consistent opaque IDs of the original and proposed parent. Its original signature must exactly match. Only that selected signature is refreshed, then the complete candidate must pass the unchanged native evaluator before an owned commit. No nearest-match rule is relaxed. The existing Width/Depth path (including its existing varying-law boundary) is unchanged.

Height combined with width/depth, start offset, draft, bindings, varying/shaped finish, multiple edges, linked/instanced/nonterminal geometry and stale original signatures are not admitted by the new route. Varying height is unqualified here, not a newly discovered unsafe law. Existing stale signatures are not automatically repaired.

## Evidence and corrections

The first candidate assumption was incorrect: height10→14 left an old midpoint signature but actual Save/fresh Open remained valid. The first fixture failed because it incorrectly expected held. A second height10→30 fixture reached an earlier **REFERENCE_MOVED safe refusal at Apply**, not a Save/Open data-loss bug. Accepted height10 was retained. Both investigation results informed the corrected baseline rather than being counted as product failures fixed. The final original-code baseline verifies that safe refusal and unchanged native geometry/history (baseline-03 PASS). No edge was silently moved to the bottom.

After implementation, actual Chrome **Fillet and Chamfer each PASS**: height10→30, native geometry, Undo/Redo, real Save download, fresh browser-context Open, a second and third edit30→14→40, invalid1 refusal retaining height40 and its signature/history/geometry, draft35 recovery and Cancel retaining40. Source capsules1073 files, page/console errors0, browser/context/server cleanup complete. Temporary original-code baseline was restored and byte-compared to the fixed files. Images were visually inspected.

Focused **52/52 PASS**: existing17 plus35 async ownership checks. Geometric table covers all12 original cuboid edges, two finish types, both height6 and30. Prefix/native topology errors, stale signatures, unsupported combined edits, three asynchronous stages' owner/revision changes, and full geometry refusal preserve the accepted document. The new async test's initial numeric error.feature fixture was corrected to its actual string n2 before its final35/35 pass; no product defect was inferred from that test-only mismatch.

Studio tsc + Vite build PASS (6.02s, existing bundler warnings), scoped ESLint and git diff --check PASS. Model/core implementation is unchanged. Full global suite and general topology/fillet coverage are not claimed. CI is checked against the published exact commit in the issue.

## Independent geometry

For the actual40×30×H block with one X-directed upper edge, Fillet R2 removes `40*(4−π)` and Chamfer D2 removes `40*2²/2`. The oracle uses independently authored expressions and compares native strict-BRep volume and Worker volume. Both finishes retain endpoints `(x,0,H−2)` and `(x,2,H)` for x0/40 and remove `(x,0,H)`. Fillet additionally contains surface midpoint `(20,2−sqrt(2),H−(2−sqrt(2)))`.

Final H40: Fillet47965.66370614359mm³, Chamfer47920mm³. Native evaluation and Worker values agree within the frozen1e−7 volume tolerance. These are synthetic design dimensions, not manufacturing acceptance. Fresh .bcad Open is not STEP interoperability. #20 remains open and manufacturing/Physics/schema5/other HOLD remain unchanged. No roadmap/doc-sync update.
