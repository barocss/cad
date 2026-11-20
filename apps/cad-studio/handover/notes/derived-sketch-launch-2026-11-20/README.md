# Starting midpoint and projected sketches

The two commands now share a check for whether a native response still belongs to the current selection and document. App starts the command and supplies access to the current editor. The launch module checks the document, evaluated input, selection, open request, worker, work scope, work generation, sketch revision and active command. A projection also checks its request number. A midpoint review checks the two selected faces before offering **Start sketch**. App.tsx decreased from 4,069 to 4,032 lines.

## Desktop Studio

| Command | Accepted result | Superseded or cancelled request |
| --- | --- | --- |
| Sketch at midpoint | Native caps at Z = 2.0002 and 10.0006 mm gave Z = 6.0004 mm. A 6 × 4 mm rectangle extruded by 3 mm gave 72 mm³. Moving the original stock preserved the sketch plane. After Save and fresh Open, changing 6 to 7 mm gave 84 mm³. | The harness held an actual native response across Cancel, a new face selection, Undo, STEP review and opening a file with reused IDs. Releasing it never installed an old draft. |
| Project to sketch | The editable XY footprint extruded by 2 mm gave 1,232 mm³ before and after fresh Open. Changing the original stock width from 32 to 34 mm changed its volume from 2,432 to 2,592 mm³. The copied extrusion stayed at 1,232 mm³. | A late projection could neither replace a newer History editor draft nor open a sketch in a replacement document with reused IDs. |

The browser checks follow the current UI. With one face selected, the command palette displays the reason inside the row and keeps the command unavailable. A new projected sketch has its own empty draft Undo/Redo stack. Cancelling the draft restores the document controls. The midpoint harness gives initial page navigation 30 seconds and retains its shorter interaction timeout.

**PASS** — Four Studio and eleven model checks, changed-file lint, Studio type check and production build, and two desktop Chrome flows. Both flows checked that the sources remained unchanged through teardown.

**NOT_RUN** — Mobile. These changes do not measure overall CAD readiness.

```sh
pnpm --filter @barocss/cad-studio-app test midpoint-sketch
pnpm --filter @barocss/cad-model test native-midpoint-plane material-footprint
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
D862_SOURCE_FROZEN=1 node test/midpoint-sketch-browser.mjs "$MIDPOINT_OUT"
D853_SOURCE_FROZEN=1 node test/material-footprint-browser.mjs "$FOOTPRINT_OUT"
```

Use Node 22.19.0, the installed desktop Chrome and Playwright, and separate evidence directories outside the checkout. Run heavy commands one at a time through the local gate.
