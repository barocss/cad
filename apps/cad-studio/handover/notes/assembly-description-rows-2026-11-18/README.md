# #682: inherited catalogue context in assembly summary

Baseline6b0df536d: actual coupling volume22851.944962mm³ and Studio renders normally, but get_assembly reports missing drive row and zero bodies/volume. Local override baseline succeeds.

Reuse resolveShopTree only for own evaluation context. Authored rows/nodes and face/key identity remain unchanged; existing cut and nested geometry routes preserved.

Focused40/40 and changed-file lint PASS. Covers inherited coupling/ring/connector, local override, original registry preservation, previous cut and nested reference regression. Actual frozen Chrome PASS: inherited summary22851.945, local override44843.094 agree with actual geometry. Both native Save/Open roundtrips preserve exact documents. Reopened captures show off-centre framing but rendered geometry and exact document checks pass; evidence images use framed initial opens. No viewport correction is claimed. All contexts/browser/server closed; source unchanged.

- baseline.png: correct Studio geometry paired with erroneous baseline summary
- fixed.png: inherited consumer with corrected summary (receipt)
- local.png: local override consumer retained
