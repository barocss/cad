# #716 — O-ring row geometry and issued Assembly-scope drawings

Baseline main 873215fdc: a base cylinder with gland and a bought O-ring, no instances array. Actual Drawing scope dropdown selects Assembly so the bought ring is projected. After revision A, Library O-ring rows file replaces synthetic row214 crossSection3.53 with3.7. The ring changes876.877014→969.111507mm³; the grooved cylinder remains13948.259048mm³. Actual SVG view paths change, but revision stale=0. This expected FAIL is not a default-part projection defect: default part drawings exclude bought elements. Actual instances-array assemblies already have conservative semantic stamps and are unchanged.

Only active ring nodes referencing an earlier active gland add the effective row insideDiameter/crossSection to the stamp. Gland-only geometry is unchanged by this valid row edit and adds no dependency. Suppressed ring/gland, unused rows and metadata are excluded. Last duplicate row wins as in the evaluator. Stored drawing records, source/geometry and references are not rewritten. Ordinary legacy, bearing/section/weld and assembly behavior remain protected. Old ring-backed node-only issues require explicit reissue; a revision marker is not a geometry certificate or manufacturing approval. The existing ideal stretched torus is not a model of the physically squeezed seal.

Frozen actual Chrome PASS: actual Assembly view-path change and stale=1, Undo/Redo, Save/fresh Open and explicit B reissue/current state. Both receipts changes=[]; contexts/browser/server closed. Screenshots directly inspected. Existing plus focused regressions35/35 PASS include immutable source, gland-only, suppressed, unused/metadata, last-row, missing/invalid-reference safe read and legacy Native roundtrip.

Mac transport disconnected while the final validation pipeline was running. Reconnection found the browser PASS receipt and35/35 log, no remaining owned process and completed cleanup. No duplicate browser was run. Type/lint exit status was not assumed from empty logs: they were rerun separately after heavy-slot allocation.

Final reconnect verification: Model TypeScript, Studio TypeScript and owned-file lint all exit0/PASS.
