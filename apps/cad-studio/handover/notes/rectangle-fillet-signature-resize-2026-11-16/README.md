# Proven rectangle resize signature preservation (#20)

Fixes the residual documented by 635cd4556: accepted Width changes kept the old edge length/midpoint signature, so native JSON reopening held an otherwise valid varying Fillet.

## Deliberately narrow contract

Only a plain root rectangle sketch, positive undrafted Extrude, and one terminal unshaped numeric varying Fillet (two ends, optionally one/two interior fractions). Only rectangle max changes through the Extrude Width/Depth inspector. No instances, extra operations, bound values, held/rematched feature, shaped law, merged/curved/chained edge or general topology rematching.

After full candidate evaluation succeeds, read both parent prefixes. Independently prove each complete cuboid: 8 exact corner roles with unique native vertices and degree3, 12 unique original nativeLine edges, 6 exact boundary planes with outward orientation and incidence4. Verify all edge endpoints and adjacent native/display faces against semantic roles and names. Across snapshots require matching semantic directed edges and face names; native IDs must be unchanged by role or completely disjoint per ID class. No prefix stripping or closest-edge guessing. This accommodates brepOf(part,id)'s first-materialization cache (part.brep ??=), which produced n2 IDs on the old cached parent and n1 IDs on the new parent in the actual worker.

Require the existing saved signature to exactly match the old parent. Require unambiguous unchanged endpoint assignment, or unchanged interior-law direction. Only replace the selected saved signature. Authored radii/fractions/coordinates and edge names are untouched. Unknown topology refuses the size edit rather than silently reconnecting it. Every asynchronous boundary checks draft/document/scope/worker/open ownership; marker/variant retirement is checked before commit.

## Verification

- Focused helper tests5/5, helper/test lint, Studio tsc PASS. Covers coherent namespace relabel, partial relabel, ID alias/swap, wrong corners/incidence, stale/shared signatures, unsupported documents, endpoint tie/reversal and interior direction drift. Independent read review found no blocker.
- Frozen actual browser `/tmp/cad-rectangle-fillet-resize-03` PASS: held worker-prefix response then Cancel retains the original document; Width40→60, Undo/Redo and native JSON reopen without References hold; Depth30→36 then reopen; invalid Depth0.2 retains accepted document. Reopened markers x0/15/37.5/60 agree with inspector. Reviewed `05-reopened-locations.png`.
- Frozen recovery regression `/tmp/cad-held-interior-fillet-resize-fixed` PASS: explicit held edge replacement with two interior controls, Cancel/Apply, Undo/Redo, resize and direct reopening without a second manual replacement. Driver Open wait now distinguishes the startup sample from the intended document.
- Independent rational polynomial oracle: integral at40 remains27731/168. Width60 expected volume17946.864968474772mm³ vs native/worker17946.864968474518; Depth36 expected21546.864968474772 vs native21546.864968474532/worker21546.864968474536. Seven native control/midspan sections, maximum residual1.204e-12mm; strict B-rep passes. Volume alone is not directional proof.
- Earlier browser runs are NOT passes: resize01 exposed a test Open race; resize02 correctly refused raw-ID equality; a diagnostic run established the cached ID difference. Final tests above use the complete topology proof and contain no diagnostic UI dump.
- App-inclusive lint is blocked by pre-existing src/App.tsx `_k` unused variable (HEAD line2483, current2484), unrelated to this change. No unrelated lint cleanup. Full suite, physical file download, remote CI and generic upstream topology persistence are not claimed. #20 remains open. Existing WIP/HOLD untouched.

Run from Studio: `node scripts/test.mjs rectangle-finish-resize`; `RECTANGLE_FILLET_RESIZE_FROZEN=1 node test/rectangle-fillet-signature-resize-browser.mjs <output>`; `HELD_INTERIOR_FROZEN=1 node test/held-interior-fillet-replacement-browser.mjs <output>`. Browser drivers require the standard Chrome/PW environment and heavy gate.

Final Studio production build PASS4.97s (existing build warnings only).
