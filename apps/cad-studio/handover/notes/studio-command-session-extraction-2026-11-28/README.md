# D2169 — Extract Studio command session state

P4 [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md) · Base `918ae0c29827bc38dbc2bb367889458d9c67fe34`.

`useStudioCommandSession` owns the active command store, HUD subscriptions, Apply queue, font upload lifetime and Fillet picked-edge request. Its command and context checks retain the existing owner. The App now wires these results to the same command and viewport consumers. `App.tsx` falls from 2,301 to 2,282 lines.

## Verification

- **PASS, actual desktop Studio WebGPU.** The D2166 18 mm upstream Extrude drag preserves provisional and full preview ownership, commits once and matches the numeric edit. The 21,187.964473723 mm³ model and downstream Fillet survive fresh Open. The stale, failed and cancelled previews retain their original retirement behavior.
- **PASS, Fillet sessions.** Actual moving, invalid, restored and two-station input shows the corresponding markers during an unmodified delayed Worker preview. Saved History movement and fresh document replacement retire the old markers. A separate actual flow verifies picked-edge row hover, keyboard focus, target removal, Apply and Undo/Redo. All three desktop flows report zero page errors, console errors and frozen-source changes.
- **PASS, affected checks.** 34 Studio tests, including font upload and Apply queue, Studio types, scoped ESLint, production build and diff check.
- **NOT_RUN.** A custom font upload through the browser, mobile and full local suites. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
pnpm --dir apps/cad-studio test command-apply font-upload failed-feature fillet-interior fillet-picked-edge
D749_SOURCE_FROZEN=1 node apps/cad-studio/test/failed-feature-preview-browser.mjs "$OUT/approval" --prefix-approval
FILLET_STATION_LOCATION_FROZEN=1 node apps/cad-studio/test/fillet-station-location-browser.mjs "$OUT/stations"
FILLET_PICKED_EDGE_HIGHLIGHT_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-picked-edge-highlight-browser.mjs "$OUT/picked-edge"
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
