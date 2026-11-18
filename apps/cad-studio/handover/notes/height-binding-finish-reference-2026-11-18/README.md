# Existing #20: History Height binding and terminal finishing reference

## Bounded contract
History may change only Extrude Height on a plain three-node rectangle part with one terminal constant Circular Fillet or equal Chamfer. The parameter table and all other authored fields remain unchanged. Numeric or a single own positive finite parameter binding is admitted. Complete native cuboid topology, semantic edge and original signature are still proved before candidate evaluation.

Numeric proof copies resolve only Height; they never replace the authored document. The resulting signature is applied to the original next document, preserving the Height binding and parameters. Existing numeric varying Height behavior remains; bound Height with a varying law is excluded. The public rectangleTopology numeric contract and Shell/Fillet callers are unchanged.

Parameters-panel value edits use a different lane and are NOT supported by this change. Generic rematch, downstream consumers, expressions, schema changes and HOLD scopes remain excluded. Issue #20 remains OPEN.

## Actual baseline
Both Fillet R2 and Chamfer D2 on 40×30×10 mm boxes: selecting existing H=30 in History Distance parameter displays 30, but Apply safely refuses REFERENCE_MOVED. Document/history/native geometry remain Height10 through Cancel and physical Save/fresh Open. This is an editing gap, not data loss.

## Fixed actual Chrome
Both finishes independently pass:
- Numeric10 → binding H30 → binding J14 → numeric40 → binding K40. Same effective height still preserves the explicit new binding intent.
- Exact authored-document equality after every edit: only Height and proved edge signature change; parameter table H/J/K/T remains unchanged.
- Strict native B-rep, independent analytic volume and top-edge contact coordinates for each height; Fillet also checks a native patch midpoint. Native and displayed volumes agree within 1e-7 mm³, contact coordinates within 1e-9 mm.
- Undo/Redo for every transition. T1 produces impossible geometry and safely refuses, preserving accepted K40, history and native result. Selecting H in the draft then Cancel also preserves K40.
- Physical Save and fresh-context Open preserve K binding, disabled numeric 40 field, source graph and exact native result.

## Verification
- 100/100 focused tests, including new binding transitions, invalid own/prototype/value/combined-change cases, native proof failures, existing numeric varying/constant and History owner tests.
- New coordinator proves both prefixes, passes the authored binding to full evaluation and commits once; document/open/worker changes and revision mismatch at all three asynchronous stages cannot commit.
- Scoped lint PASS. Model type-check PASS. Studio tsc/Vite build PASS.
- Existing numeric Height + bound finish actual browser regression PASS, including radius parameter change and Save/Open.
- All three fixed/regression browser runs passed first execution; source writers stopped before freezing; contexts/browser/server cleaned up. Disk 36.46→34.87 GiB.

Baseline had H only; final fixture additionally defines J/K/T for transitions, without changing baseline H or geometry. No parameter table mutation is performed by any tested History operation. Synthetic fixture screenshots contain no private data.
