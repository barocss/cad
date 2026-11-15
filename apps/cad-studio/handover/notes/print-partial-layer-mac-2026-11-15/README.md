# D1392 — actual partial Print preview layer bands

Completes #602 for the existing display-mesh Print preview. Layer count remains `max(1,ceil(top/h-1e-9))`. Each sample uses the midpoint of `[min(top,k*h), min(top,(k+1)*h)]`, so a final partial band cannot place its sample above the mesh. Overhang overlap uses that same actual band, not a full-width band shifted around the corrected sample. Support sampling uses the corrected Z; global support columns/volume remain unchanged. No native geometry, manufacturing or slicer capability changes.

## Sources

- `packages/barocss-cad-model/src/print/layers.ts`: actual band midpoint and overhang bounds only.
- `packages/barocss-cad-model/test/print-layers.test.ts`: finite extremes, partial/full/tiny bands, epsilon count boundaries, isolated chunk64 crossing, signed/oblique directions and overhang/support regressions.
- `apps/cad-studio/test/print-partial-layer.test.ts`: existing panel result contract.
- `apps/cad-studio/test/print-partial-layer-browser.mjs`: actual desktop settings/lifecycle proof.

Existing chunk lookup remains conservative, cache identity/count policy unchanged. `print-layers-v1` remains the unchanged ephemeral payload schema, not stored layer geometry. Model exports current TypeScript source; no stale Model distribution was used. Worker and panel already consume layer Z and actual band top correctly; no product UI source edit needed.

## Verification

Node22.19.0: 15/15 Model print-layers/preview tests and 7/7 Studio partial-layer/source-scope/open-surface tests PASS. Targeted ESLint, Model and Studio TypeScript, production Studio build PASS. Tests include 6/.35 final18 Z5.975 and previous17 Z5.775; 6/.30 final20 Z5.85; exact multiples, residues above/below half a layer, heights below one layer, finite MAX height input, floating count boundaries, isolated finalchunk64, signed/diagonal on-mesh samples, and separation of final overhang band from support sample.

Actual Chrome first run PASS at 1024×800 and 1440×900: 34 recorded layer observations. For 6/.35, final18 is Z5.975/Top6/one contour and previous17 is Z5.775/Top5.95/one contour. The .30 control is final20/Z5.85. Six signed axes match independent box extents and midpoint calculations. Supports/printed overlays, hide/reveal, layer-height Undo/Redo and native Save/fresh Open retain coherent values and results; feature nodes unchanged. Four last-partial/fresh-open screenshots reviewed with readable status, top and settings. No source changes/runtime errors; clean shutdown.

Receipt `d1392-first/receipt.json` SHA256 `9405324b05afc0deb743d783b5c35a98d83edf4b88761ee3227bf267073492cc`; local evidence retained outside the repository.

Diagonal/tiny-height/chunk-boundary coverage is Model-test-only, not actual browser coverage. Support overlays are estimates, not manufacturing validation; external slicers, actual manufacturing and assistive technology NOT_RUN. Existing unrelated App lint and aggregate docs drift remain separate. No full-suite claim or HOLD change.
