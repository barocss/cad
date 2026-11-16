# Remaining validation triage after #623

Read baseline `9d309c3b67109b7f45bc7edf06dee89a08a5bb78`. No golden regeneration, PDF fix or tolerance snap.

## SVG output

#623's final unrun gate is physical download/fresh-file open; actual export bytes and independent parser checks already passed. Downloads remain separately gated.

The two old golden failures are not both ASME PDF HOLD. `drawing-sheets` first fails on plain PDF (`533e647…` versus `d280596…`); `drawing-units-golden` retains all six dimension-data hashes but differs in SVG/DXF bytes. D1401's hidden-ink note records pre-existing failures before its deliberate duplicate hidden-LINE removal, independently checked across 51 artifacts. Old unresolved drift plus later justified output changes does not establish that all current expected hashes are safely stale. A later SVG/DXF semantic first-difference investigation is distinct from #623. PDF/HOLD scope stays unchanged.

## #35: actual native diameter provenance

One authored circle radius 6.35, Extrude 10, was evaluated once through the actual native source and top projection. The projected circle radius is 6.3500000000000005; the resolved diameter is 12.700000000000001. Actual buildSheet text is `Ø12.7 +0.254/-0.253` in mm and `Ø.500 +.010/-.009` in inch. The literal 12.7 unit witness does not cover this path.

`brep-tessellate.ts` circleOf reconstructs radius from rational control points/weight using acos and sin. `brep-hidden-line.ts` forwards it; Model `drawing/dimensions.ts` uses 2*r. Curve/Brep currently retains no separate authored analytic radius. Face geometry uses the same reconstruction, so it is not independent provenance. Guessing sketch radius from a feature name would lose Boolean/transform/placed ownership.

Independent Python Fraction checks show the current displayed intervals do not widen the raw zone. Forcing symmetry or rounding the nominal may widen it. Therefore no unproven snap was applied; #35 remains open for a source-qualified numerical/provenance fix with separate native validation. Synthetic result and rational interval evidence are retained beside this note. No PDF/export/download or user-data action was involved.
