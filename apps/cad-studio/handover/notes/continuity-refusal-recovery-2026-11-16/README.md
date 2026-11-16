# Continuity refusal recovery (#117)

An unsupported native edge now gives one short action: select another native edge. The exact technical reason is available under Measurement detail. Measure is disabled for that unsupported result until the selection changes. Focus returns to the selector if the initiating button or body still owns focus, without stealing focus from another control. Selecting a different edge clears the result and enables measurement. Document state and geometry are unchanged.

Validation: real 30x12x20 mm box with R2 fillet in Chrome at 1440x900 and 1024x900. Both curved ends refuse with missing-pcurve; repeat measurement is disabled; focus returns to the selector; details expose the original reason. Both straight interfaces recover immediately to 0° and 8 samples. Independent fillet geometry/normal oracle, unchanged document, Undo/Redo and stale inspection clearing pass. The 1024px failure-state screenshot was reviewed. Continuity model regressions 7/7 PASS, changed-file ESLint and final Studio typecheck/build PASS.

Run `D1259_SOURCE_FROZEN=1 ... node apps/cad-studio/test/fillet-continuity-browser.mjs OUTPUT WIDTH`. No agent/curvature replay, other fillet types, other browsers, assistive technologies or full repository suite qualified in this run. This does not add support for the refused boundary.
