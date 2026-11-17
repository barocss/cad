# Bound finishing dimensions survive proven rectangle resize (#651)

Baseline main c666bd18d. In a 40×30×10 rectangle → Extrude → terminal constant Fillet with radius `{parameter:'R'}`, R=2, History Width40→60 succeeds. However, its signature remains midpoint[20,0,10]/length40. A physical Save opened in a fresh browser context becomes held/suppressed (top/bottom ambiguity) and returns volume18000 instead of the accepted finished shape. This is reference persistence failure, not silent application on a wrong edge.

## Bounded fix

Width/Depth admission now accepts numeric dimensions or exact own `{parameter:string}` bindings resolving through an own parameter key to a finite positive number. The whole document's parameters and finishing law must remain unchanged. Original bindings, radius stations, fraction/endpoint values and names are retained; only the selected signature is refreshed after full candidate evaluation and the existing complete native cuboid proof (8 corners,12 edges,6 faces, incidence/role/opaque-ID consistency/exact prior signature).

Height stays numeric-only. No parameter expressions, schema/native rematch changes, general topology, held-edge repair, or dependency-system expansion. A stale prior signature or unsupported topology is not guessed or silently repaired. Existing HOLD/WIP and doc-sync pause remain.

## Verification

- Focused60/60 PASS: prior numeric Width/Depth/Height and owner tests plus8 bound tests. Constant Fillet/Chamfer and mixed numeric/bound varying law; identity preservation, numeric-equivalent native geometry, malformed/missing/inherited/nonfinite/nonpositive bindings, changed parameters/law, bound Height, stale signature and corrupt topology refusal.
- Target ESLint and diff-check PASS. Studio tsc and production build PASS5.85s (existing bundler warnings). No new async controller or kernel source change.
- Actual frozen Chrome baseline records stale signature and held fresh-open result. Fixed Fillet and Chamfer each pass Width40→60, signature midpoint30/length60, native shape, Undo/Redo, physical Save/fresh-context Open without References; R2→3 through real Parameters UI, Undo/Redo; Depth30→36 and a second physical Save/fresh Open; Depth1 refusal preserves document/history/native shape, recovery draft38 then Cancel preserves36.
- Independent Python formulas and native B-rep strict check/vertices verify top-edge geometry. Fillet volume=W*D*H−W*R²*(1−π/4); Chamfer volume=W*D*H−W*R²/2. Native contact endpoints are (x,0,H−R),(x,R,H), x=0/W; old corner absent. Fillet native midpoint also checked. Final W60/D36/H10/R3 expected Fillet21484.115008234622, Chamfer21330 mm³, absolute tolerance1e−7. Worker and native volumes both checked.
- Each browser run has1073 source files unchanged, no console/page errors, and complete browser/context/server cleanup. Inspected baseline held screen, fixed Fillet and Chamfer refusal images.
- Actual authored fixture is opened via file input, not created by clicking every initial modeling command. Mixed varying law is focused-native only, not new browser-qualified. Actual late-reply interruption/full suite/other CAD programs/mobile are NOT_RUN. Prior owner tests60-set include existing async coverage, not a new browser timing claim. Umbrella #20 remains OPEN.

Driver: `RECTANGLE_BOUND_FINISH_SOURCE_FROZEN=1 node test/rectangle-bound-finish-resize-browser.mjs <output> [--baseline] [--chamfer]`, standard Chrome/PW settings and heavy gate required. Summaries and screenshots accompany this note; exact commit CI recorded in the issue after push.
