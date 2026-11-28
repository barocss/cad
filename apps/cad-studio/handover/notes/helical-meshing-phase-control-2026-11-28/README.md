# D2173 — Compare normal helical meshing and deliberate tooth interference

P1 [row 07](../../roadmap-rows/07.md) and [row 16](../../roadmap-rows/16.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `36632b6bf11f3d110963556c41d95bba8fdac70c`.

The D2164 image uses the `gear-helical-pair-crossing-intersect` corpus, which intentionally adds 3° to the mating gear to create an overlap. Its expected overlap volume of approximately 24.15 mm³ comes from sampled transverse integration. D2164 still records a native Intersect refusal.

This control starts in an empty Studio document and authors two 18-tooth gears with the Spur gear and Meshing gear commands. Both use the current generated root, normal module 2, helix angle 20°, 6 mm face width and zero thinning. Model derives the opposite hand for the follower from its mesh reference. Separate native evaluation of the actual authored document checks both valid B-reps and the placements. Their shaft axes are 38.3103998091 mm apart, matching the independent calculation `36 / cos(20°)`. The follower turns 170° at zero phase and 173° at 3° with both centers unchanged.

## Verification

- **PASS.** Actual Chrome desktop creation, phase edit cancel, deliberate 3° Apply, Undo/Redo and Save/Close/reload/Open. The selected follower reported clearance over a tooth period at phase zero, crossing at the start of the sweep at phase 3°, and clearance again after restoring and reopening the zero-phase pair. The driver checked 1,288 frozen files with no source writes and zero page errors, console errors or downloads.
- **PASS.** The existing Kernel control independently samples native outlines at five axial heights in its schematic-root, thinned pair. Its zero-phase sections did not cross and its 3° control crossed. The helical Model command test passed within the 19-test primitive run.
- **FAIL, harness incidents.** The first locators did not use the palette or clear the initial demo. A subsequent receipt contained the valid clearance note, but the driver had anchored a pattern before its leading space. The final run uses the palette, creates a new part and checks the visible note.
- **FAIL, separate existing checks.** The Model primitive run passed 17 of 19. Its SubD Torus and Tube fixtures expected a smaller-radius diagnostic and received the generic invalid-input diagnostic. This change touches neither producer nor test.
- **NOT_RUN.** A valid native Intersect volume for the original corpus, a global no-interference certificate between native surfaces, manufacturing tolerance, full local suites and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language agent completion remain unmeasured.

```sh
HELICAL_MESHING_PHASE_FROZEN=1 node apps/cad-studio/test/helical-meshing-phase-browser.mjs "$OUT/verdict"
node --test --test-name-pattern 'a meshing helical gear in the part model' packages/barocss-cad/test/gear-helical.test.mjs
pnpm --dir packages/barocss-cad-model test primitives
```
