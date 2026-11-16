# Report a sketch coordinate that the current solve did not retain

CAD #21, original checklist rows 2900/2903/2905. Bounded UI feedback, not a solver or mobility-direction change.

The Point X/Y panel sends the exact source shape, point, axis and requested value alongside its existing candidate. After successful settling of a closed straight outline, a separate status describes a request that differs from the actual coordinate at the panel's existing four-decimal display precision. It does not identify an indirect constraint as the cause. Source coordinates, solver tolerances, existing adjacent-length removal and draft history semantics remain unchanged.

The status receipt owns the document, exact settled shape and sketch generation. Undo/Redo, outline switches, document replacement and Cancel cannot revive it. Existing solver/Finish errors take precedence. The status does not disable Finish. Curved outlines are excluded; this is not new curved mobility support.

## Evidence

- Baseline `/tmp/cad-coordinate-before02`: actual Chrome 1440×900. An anchored H/V 40×20 rectangle with bottom Length40 returns Point3 X51 to50 silently, while Point3 Y35 succeeds. No accepted document changes before Finish.
- Final `/tmp/cad-coordinate-after02`: same input shows `Point 3 X is 50 mm, not the requested 51 mm. The current constraints did not retain that coordinate.` Successful Y35 clears it. Undo/Redo clears it; a further failed X request followed by Cancel and fresh sketch entry leaves no old status.
- Finish and document Undo/Redo pass. Final `03-finished.json` document AND body snapshot are exactly equal to baseline02, including the pre-existing numerical solver/history behavior. No history-step coalescing or tolerance widening was introduced.
- Baseline01 initially failed a harness assumption that Undo after a second X request must immediately return Y34. Existing solving leaves a tiny additional history step; Undo retained Y35. The corrected driver observes rather than rewrites this behavior. Baseline01 remains a harness FAIL, separate from the confirmed silent-coordinate reproduction.
- Focused tests 3/3: displayed-value comparison, no source mutation, finite/point/source/refusal/curve guards, exact document/shape/generation receipt ownership. Studio type check and scoped product lint PASS. Actual final run exit0; page errors, console errors, downloads and source changes all empty. Context/browser/server closed. Blocked-X screenshot reviewed.
- NOT_RUN: actual explicit Fix/free-triangle cases, actual multiple-outline/New-document transitions (receipt ownership tested directly), curved outlines, direction-vector diagnostics, arbitrary indirect conflict attribution, broader browser/DPI matrix. No claim that explicitly fixed or indirect causes are identified.

Product: `src/sketch/coordinateFeedback.ts`, `src/ui/SketchPanel.tsx`, `src/App.tsx`.
Tests: `test/sketch-coordinate-feedback.test.ts`, `test/sketch-coordinate-feedback-browser.mjs`.

Parent integration verification: production build PASS in 3.82s, `/tmp/cad-coordinate-build.log`. Final driver lint, node syntax and git diff check PASS.
