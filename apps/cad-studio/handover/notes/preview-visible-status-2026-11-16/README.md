# Preview & analysis visible state (#50)

Display-only changes; no slicing, manufacturing, device, schema, or annotation-placement behavior changed.

- Collapsed Print distinguishes Model-only, no visible solid, other pauses, pending, failed and ready states. Expanded mode uses its selected mode button rather than a duplicate header chip; None no longer repeats constant instructions.
- Checked 3D annotations retain their suspension reason immediately below the header, including while collapsed. The tooltip no longer promises simultaneous Print/CNC visibility.
- Annotation counts distinguish a note-only sheet (0 on model, 1 sheet-only) from an empty drawing.
- Print layer number, geometric result details and color legend are shown only for current ready results. Controls and the NOT FOR PRODUCTION notice remain available without a result.

## Validation

- Pure status and existing PMI tests: 5/5 PASS.
- Focused changed helpers/components/browser tests lint PASS. App.tsx lint still reports its pre-existing unrelated `_k` unused variable (line 2432); not a whole-file lint pass.
- Studio TypeScript/Vite production build PASS.
- `preview-visible-status-browser.mjs`, 1024×800 and 1440×900: PASS. Actual sheet-only note then 3D dimension; Print and loaded Drawing suspension with collapsed panel; Model/None recovery without unchecking annotations; New part empty state; disabled slider and absent result number/legend; Undo restores original layer count and document, Redo restores empty; required safety notice retained. No document mutation from preview selection or workspace transitions.
- Final frozen-source receipt PASS; no browser or console errors. Narrow-screen Drawing suspension and empty Print screenshots inspected.
- First run failed only the test's JSON key-order comparison after opening a drawing; replaced with deep equality against the parsed document. Both subsequent browser runs passed; final run also waits for the actual Drawing sheet.
- Evidence: `/tmp/cad-preview-visible-status-r3-20261116`; build log `/tmp/cad-preview-status-build-r3.log`.

WebGL2, assistive technology, deliberate delayed-response injection and CNC/device flows were not run. Existing HOLD scopes and #126 WIP are unchanged.
