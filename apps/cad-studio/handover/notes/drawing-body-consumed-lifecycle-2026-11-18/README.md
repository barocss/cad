# Existing #270: consumed owner and explicit reselection

Validation-only continuation on 3b76bd82f. No product change or new issue; #270 remains OPEN. Existing native Extrude selection correctly refuses an output consumed by an actual Move and allows only explicit supported reselection, with manual-reference protection intact.

Synthetic A box 30×12×6 mm, B box20×8×10 at x50. The actual UI selects A for drawing, then applies Move ΔX5. The stored translate targets original n1, leaves the original four nodes and drawing settings unchanged, and removes b1 from the current outputs. Native evaluated volumes remain A2160 and B1600 mm³. This is numeric mass evidence, not a new strict B-rep validation claim.

Actual frozen Chrome PASS: the consumed selector yields `DRAWING_SCOPE` not-a-unique-current-output, no usable sheet, and disabled SVG/DXF. This differs from missing/suppressed source refusal. Undo restores the original accepted document and usable A sheet; Redo refuses again. Consumed Save/fresh Open retains the selector and refusal. The current selectable list contains only B, not the unsupported Translate output. Selecting B in the draft does not mutate the document or restore a sheet. Explicit Use body commits B, preserves everything outside drawing settings, and produces front20×10/top20×8 with n3 edge owners. Undo/Redo and Save/fresh Open preserve the corresponding blocked/selected state.

A separate valid native document with a retained manual A dimension refuses both B selection and whole-base scope change, preserves the full accepted document and reference, and retains it through Save/fresh Open. No references are deleted or silently retargeted. This does not newly qualify automatic-dimension reset or draft invalidation during Open/Undo.

Actual SVG/DXF downloads are retained. Independent Python XML/DXF readback checks B front20×10/top20×8 and each front/top SVG line's matching DXF VISIBLE/HIDDEN LINE after page-Y conversion. The initial torus POLYLINE-only reader was inapplicable to this rectangular LINE output and was corrected before PASS. Extra DXF entities, right/iso file geometry, manufacturing certification and PDF are not qualified.

Browser receipt PASS, source changes=[], five contexts/browser/server closed, no owned process remained. Outer shell post-run reporting used zsh's read-only `status` variable and exited1 after browser completion; this is not a browser/product failure. Receipt/log and cleanup were checked independently. Subsequent shell uses `rc`. Disk34→37 GiB. Local three screenshots reviewed; B success screenshot retains the earlier error toast, while current sheet and actual file export succeed. No claim that old notification disappears.

Independent read-only review found no blocking fixture defect. The final driver includes two explicit native volume assertions added after the initial read-only review snapshot. Existing Model scope/body/reference/P2 regressions 28/28 PASS; affected fixture lint and syntax PASS. No TypeScript or product source changed, so new type-check/build not claimed.

Worker observations check front/top bounds and edge owners. Same-page Undo may use an earlier observed successful reply, so it proves accepted-document/usable-sheet restoration, not a newly delivered Worker response. Fresh-open B uses a new context and new successful reply. No delayed-response race qualification.

Reproduce: `DRAWING_BODY_CONSUMED_FROZEN=1 node apps/cad-studio/test/drawing-body-consumed-lifecycle-browser.mjs <output>` with Chrome/PW_DIR, then `python3 apps/cad-studio/test/drawing-body-consumed-export-oracle.py <output>`. Regressions: `node packages/barocss-cad-model/scripts/test.mjs drawing-body-scope drawing-body-reference-recovery drawing-scope p2-drawing-scope-contract`.

Remaining #270 includes wider consumed/replaced/split/import families, currentness races, automatic-dimension/reference completeness and stated HOLDs. Do not close the whole issue from this limited successful lifecycle.
