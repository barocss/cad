# D1374 — selected arc scope

Completes #150 after D1373 native arc classification. A default visible Selected arc segment explanation states values describe this edge, not the whole source curve. Actual Line classification and geometric calculations are unchanged.

Studio type check, scoped SelectionInspector lint, production build and diff check PASS. Actual Chrome 1024/1440 draws ellipse12x6, extrudes6, picks two regions and asserts Arc/radius3 and24, visible scope text and unchanged document. Both widths visually reviewed. Receipt SHA256 `18fa60c8da27e11f10d7d04b3e69a744ebbf42adca55f9c2081fdd98446593d6`.

D1373 Model16/16 covers real Line, native arcs at multiple display qualities and previous full-circle/legacy controls. This follow-up only changes display text and browser assertions. No whole-ellipse interval/length inference, external STEP or assistive technology claim. Existing CI, App lint and API inventory baseline limits remain separate. Next: #97 owned Offset collapse and downstream recovery.
