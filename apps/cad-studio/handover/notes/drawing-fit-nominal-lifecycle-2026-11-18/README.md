# Existing #269: nominal edit and primary/dual fit-list lifecycle

Validation-only on 43e71ef7e. No product changes or new issue. #269 stays OPEN.

Synthetic 60×40×8 mm plate with a Ø12 through hole and one authored top-view diameter. User-supplied H7 row has range (10,18], upper +0.018/lower 0 mm, source `trial-only`; these are test data, not certified standards.

Actual frozen Chrome PASS: History Ø12→14 updates the fit list; Undo returns Ø12 and Redo Ø14, checking accepted radius, resolved diameter and unchanged fits data. This does not assert whole-document Undo equality because reference signatures normalize. Inch/dual keeps the table in primary units (.5512 inch, H7 +.0006/0) and the callout includes the Ø14 secondary display. Actual measured diameter is 14.000000000000002: the existing conservative formatter yields secondary +0.018/+0.001; no rounding policy is changed.

Attempting Ø19 is rejected during model Apply with “A fit class has no row in your fit tables”. The entire accepted Ø14 document remains unchanged. A successfully committed Ø19 drawing with an unavailable table was NOT reached and is not claimed. Native Save is semantically equal to the accepted document; fresh-context Open preserves the document and valid inch/dual fit list.

Actual browser SVG/DXF downloads pass independent XML/DXF TEXT readback: the bore-fit row occurs once, primary header/value/deviations, dual callout, source and scope notices are present. Rounded primary limits remain inside supplied [14,14.018] mm. DXF %%c diameter escapes are decoded. This is text/entity readback, not an external DXF viewer, full geometry comparison or manufacturing certification.

Related drawing-fit-list, fit-drawing, fit-table-priority and fit-mmgs regressions: 16/16 PASS. Independent read-only review found no remaining blocker. Browser receipt changes=[], errors=[], two contexts/browser/server closed; no owned process remains, 38 GiB free. Local screenshots inspected. No TypeScript/product changes, so no new type/build claim.

Prior exploratory fixtures failed before this final run: source+estimate was invalid fixture input; two unit waits mistakenly inspected primary-only hook text and then an icon SVG. These were fixture failures, not product defects. The final fixture uses actual SVG text and specifically asserts the fit-row refusal. The first external readback attempt lacked the standard DXF %%c decoder; corrected independent parser passes the same downloaded bytes.

Reproduce with Chrome/PW_DIR: `DRAWING_FIT_NOMINAL_FROZEN=1 node apps/cad-studio/test/drawing-fit-nominal-lifecycle-browser.mjs <output>` then `python3 apps/cad-studio/test/drawing-fit-nominal-export-oracle.py <output>`.

Limits: one base-part sheet, one ordinary diameter, source-backed row only. Pair/estimate mode, deletion/reordering, interruption/currentness and unsupported scope matrix remain unqualified. The minimal drawing has existing overlap/location/overall diagnostics and is not claimed issue-free. HOLDs remain unchanged. No automatic row replacement or standards computation is introduced.
