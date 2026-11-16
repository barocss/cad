# Known too-small fastener hole (#31 partial)

On mainf316bee00 a64×32×8 plate with aØ6.6 through hole accepted M8×20 as both a free bolt and a nut joint. The native result had2/4 bodies even though its Hole step reported tight/done:false. Step warnings are not admission checks.

The shared fastener builder now rejects only a threaded bolt/screw whose finite positive supplied holeD is classified tight by the existing holeFit contract. FASTENER_HOLE_FIT identifies the selected diameter, nominal size, clearance and tap-drill alternatives. This covers in-part and assembly-instance construction and ordinary Edit Fastener builds. Valid tap-drill fits, no-hole-information placement, standalone nuts/washers, loose-fit and other advisory checks retain their previous semantics. This is not a strength or manufacturing check.

Legacy mismatches must still be repairable. The shapeEdit recognition probe temporarily omits only holeD (which has no geometry effect), rebuilds, restores that same field in the regenerated made metadata and compares the entire authored node slice exactly. No geometry or other metadata is ignored. The returned editing command still enforces the new guard. Native tests prove repair to M6 and rejection after unrecorded geometry changes.

Manual position changes retire the old hole snapshot only when nonempty finite numeric previous/new coordinates prove an actual change and no new hole pick accompanies it. patchValues supplies optional previous values to derive; other command derivations retain their behavior. Same numeric/string coordinates, blank intermediate input and callers without previous evidence do not silently discard the fit check. A new pointer pick retains its supplied evidence; pointer placement away from a hole clears it as before. No persistent hole association is invented.

## Verification

- Pre-fix external native reproduction retained at `/tmp/cad-fastener-fit-investigation/result.json` (actual plate and hole). No code changes made during reproduction.
- Final model runner selection `fastener-hole-fit fasteners bom`:56/56 PASS (substring selection includes related suites); targeted earlier selection20/20. Covers direct/assembly rejection, native geometry equivalence for compatible tap/clearance/no-info cases, nut/washer, exact legacy replay and repair, latest position changes, same coordinates, and32→empty→32 retention.
- Final target lint, full Model tsc, Studio tsc, diff check, production build4.87s PASS. Existing bundler warnings remain.
- Frozen actual Studio `/tmp/cad-fastener-fit-browser-03` PASS: actual hole-wall pointer pick chooses M6; choosing M8 refuses preview and disables Apply without changing the plate. Re-entering32.0 and clearing/retyping32 still refuse. Explicit X44 motion releases the old hole snapshot; Cancel retains the plate. Repicking the hole and applying M6 produces the expected plate/bolt/washer/nut4-body result, Undo/Redo and in-memory native JSON reopen retain it. Screenshot `01-M8-refused-on-6.6.png` reviewed. No browser/console errors, source changes or physical downloads.
- Earlier browser01/02 passed their narrower checks; review found same-coordinate and empty-input evidence gaps, which were fixed before final03. No unsupported claim of persistent attachment or automatic following.

#31 remains open: generic History entry into the grouped Fastener editor, parent-hole movement/replacement guidance and Mount catalogue/group-history issues are separate. Existing #126 WIP and all HOLD scopes are unchanged. No App props or UI ownership were added.

Studio under the heavy gate and standard PW_DIR/CHROME: `FASTENER_FIT_FROZEN=1 node test/fastener-hole-fit-browser.mjs <output>`.
