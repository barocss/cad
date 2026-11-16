# Explicit held varying-Fillet edge replacement (#20)

## Scope and behavior
A terminal held Fillet with one missing edge and exactly two positive finite numeric atEnd radii can now use History → Replace edge. Only an original unmerged exact straight candidate is admitted. Its displayed first endpoint receives saved Start radius, second receives saved End radius; this is explicitly explained before Apply edge. No nearest-point direction inference or automatic reference reassignment. Candidate coordinates appear in History and at the same physical viewport locations. Merely selecting a candidate changes no document or geometry.

Apply rechecks source ownership, unique source body, candidate edge identity, names and exact displayed coordinates, then evaluates the complete candidate document. Only success commits; ID, parent, radius values and unrelated nodes remain unchanged. Invalid picks clear the candidate. Pending Cancel, History/document changes and stale worker results retire the ticket. Invalid numeric drafts cannot start replacement. Existing constant Fillet/Chamfer behavior retained.

Parameterized/shaped laws, interior stations, nonterminal varying features, curved/merged/multiple edges remain excluded. #20 remains open for its broader linked-inset/reference and family requirements. #118 multi-edge topology remains separate; #126 WIP and HOLD untouched.

## Verified
- Focused helper tests4/4 PASS: reversed candidate direction, immutable radius/identity preservation, numeric/shape/interior/terminal guards, malformed/ambiguous edges, constant compatibility.
- Studio tsc PASS; targeted helper/hook/NodeEditor/test lint PASS. Final build separately recorded below.
- Frozen actual browser `/tmp/cad-held-variable-fillet-01`: missing variable edge opens held; candidate displays Start1 at[0,0,20], End3 at[30,0,20]; select/Cancel unchanged; actual worker result deliberately held during Apply then Cancel releases without committing; fresh retry applies; Undo/Redo and New part/native JSON Open retain the result. Reviewed `02-staged-mapping.png` and both markers/explicit assignment text.
- Native strict B-rep PASS. Volume7172.101761241656 mm³ equals independent7200−130(1−π/4) within1e-6; native surface endpoint contacts verify radius1 at X0 and radius3 at X30 within1e-7. A volume-only direction claim is not used.
- Separate frozen `/tmp/cad-held-variable-retirement-01 --failure-retirement`: R30→40 native refusal retains accepted held document; another evaluation response is held while New part replaces the document, then released; new empty document and no endpoint markers remain. No stale recovery commit.
- No physical Project Save/download, full suites or general multi-edge recovery claim. Native reader uses unchanged Model/native code; product changes are Studio-only. Protected original checkout's existing WIP preserved.

Run from Studio: `node scripts/test.mjs held-finish-replacement`; `HELD_VARIABLE_FILLET_FROZEN=1 node test/held-variable-fillet-replacement-browser.mjs <output>` and the same with `--failure-retirement`.

Final production build PASS in4.38s (existing dynamic-import/directive warnings). Remote CI reported separately.
