# Constraint mark actual-use acceptance

Baseline `fbf14ce17baba64c457c56c3188d5b495e94f960`; #264, bounded desktop P1/P4 evidence. No production change.

`constraint-mark-acceptance-browser.mjs` final actual Chrome run passed at 1280×900 and 1024×800, deviceScaleFactor 2 (emulated CSS/device pixel ratio, not a physical display claim).

- Square with explicit empty H/V set and Parallel, Perpendicular, Equal, Fixed relations: seven distinct glyphs retained, actual chip rectangles non-overlapping when no crowding notice, solver not over-defined. Zoom, pan and resize leave accepted source and dirty/solver state unchanged.
- Remove Equal in the existing list: draft Undo/Redo restores/removes two glyphs. Cancel restores all seven. Finish removal then first document Undo, reopening and Cancel preserve the document Redo, which restores the edited three-rule sketch.
- Browser project Save writes exactly the accepted document. Close project, reload, reopen and edit recover five glyphs from the current viewport, without stored display coordinates.
- Open a separate valid quarter-sector with Coincident point 1/arc 2 at the same node/rule index: only its own glyph remains. Cancel/New leave no glyph or crowding notice.
- No page errors, console errors, watched source changes or downloads. Screenshots were reviewed, including normal multi-type state and pan/resize.

Earlier run 01 reached Finish then failed because the harness inspected node.rules instead of node.outline.rules. Run 02 passed assertions, but visual review exposed automatically inferred H/V relations and a redundancy warning in the square fixture. Final run 03 explicitly preserves empty H/V and asserts absence of over-definition. These were harness/fixture corrections, not production fixes.

This extends the earlier normal spacing, dimension edit/Cancel, native Extrude, dense fallback, light/dark and pure ownership receipts without rerunning those unrelated cases. No new gap was found in this bounded acceptance. #264 is not a claim that every projection, arbitrary density or physical monitor is qualified. Native-folder/download, mobile, PDF and all existing HOLDs remain untouched. Move to the next roadmap feature rather than repeating this matrix.
