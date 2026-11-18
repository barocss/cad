# Explicit terminal Subtract operand swap (#728)

## Scope
Exactly two independent numeric XY rectangle extrusions followed by terminal Difference. History offers **Edit Subtract operands** with explicit Keep/Swap choices identifying the stored target/tool IDs. Only parent/tool references change. Source nodes, IDs, indexes, nextId and outputs remain unchanged. Existing owner/worker/revision guards in HistoryFeatureEditor are reused; the captured command also checks document identity and canonical revision.

Both original and candidate native outputs must be a strict-valid nonempty single solid with the same Difference feature ID and positive finite volume. Empty or invalid results are refused without committing. No topology rematch or face/edge identity preservation is claimed. Downstream features, attached cuts, bindings, nonplain geometry and external metadata consumers are excluded. Actual Direct data is excluded; a runtime direct:undefined field is not geometry.

## Baseline
Actual two-body selection and Combine→Subtract created parent n1/tool n3. History had no editable dimensions or operand command. The valid A−B result, Undo/Redo and Save/fresh Open passed. This was an editability gap, not document corruption. Source base: 6f35d6217ca2a7161617685aca594fbaf36bc14e.

## Verification
- Focused Subtract6 plus adjacent Loft8: **14/14 PASS**. Source/reference retention, Keep and swap-back, codec replay, empty reverse refusal, stale identity/content, invalid choice, and metadata/downstream/nonplain exclusion.
- Actual fixed Chrome: Swap preview Cancel leaves document/native unchanged; explicit Apply changes only parent/tool; first Undo/Redo, own Save/fresh Open, reverse swap and second history/file roundtrip pass.
- Independent native box oracle: A=[0,0,0]..[40,30,10], B=[20,0,0]..[50,30,10]. A−B=6000 mm³, centroid[10,15,5]; B−A=3000 mm³, centroid[45,15,5]. Strict B-rep, one solid, eight-corner bijection; volume comparison1e-7, point comparison1e-8 mm.
- Contained-tool control B=[10,5,0]..[20,15,10]: original11000 mm³, independently subtracted centroid and16corner bijection. Reverse is empty: refused preview, Apply disabled, original document/history/native preserved after Cancel and Save/fresh Open.
- Existing History cut-source browser regression: PASS (History/Browser selection, four pattern launch/Cancel paths at1024/1440). This does not add broader cut-source support.
- Model typecheck, Studio typecheck/build (5.39s), scoped lint, driver syntax and diff whitespace: PASS.
- Browser/server cleanup and source freeze passed. Actual preview and refusal screenshots visually inspected.
- Exact main CI and public image render verification pending publication; final issue comment is authoritative.

## Limits
Actual delayed worker/document replacement injection and all excluded geometry/consumer combinations are NOT_RUN; captured stale-source focused checks pass and existing History ownership guards remain unchanged. This is not general Boolean editing or topology continuity. No schema/native algorithm changes. Existing HOLD and doc-sync pause remain.
