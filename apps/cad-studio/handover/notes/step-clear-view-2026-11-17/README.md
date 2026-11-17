# Explicit clearing of a saved assembly-step view

Baseline `3d08857cc`. Model already supports `editAssemblyStep({id, view:null})`, but Studio offered only Capture and Reset. A saved recommendation could not be removed through the panel, so entering the step kept taking the camera back. Add **Clear saved view**, disabled when none is saved. This removes only that step's camera recommendation using the existing document transaction. The current user camera is retained; later step entry has no recommended camera to apply. Capture remains available. No schema, Model/API, geometry, placement or rendering change.

## Verification

- Focused Studio11/11 PASS (assembly display/state9, scale draft2), type/targeted lint/diff PASS.
- Actual Chrome first run PASS. Two synthetic top-level assembly steps: enter step1's recommendation, switch to Top, Clear, Next/Previous. Camera readbacks compare exactly and Clear/navigation retain the user camera. Undo re-enables Reset; Reset returns exactly to the initial recommended camera. Redo removes the recommendation again.
- Actual native Save download and fresh Open: entering the cleared step retains the freshly opened camera, Reset/Clear disabled. Recapture saves a new recommendation and enables both again. Nodes/instances/mates remain identical to the original fixture. No console/page errors or frozen source changes.
- Reopened screenshot directly reviewed. This is a camera-ownership/UI/persistence check, not a new precision/roll guarantee or fit-all viewport qualification.

NOT_RUN: playback, nested steps, arbitrary document races, neutral export, general camera precision. Existing HOLDs remain; #207's broader remaining scope stays open.

Commands: `node apps/cad-studio/scripts/test.mjs assembly-steps step-explode-draft`; `node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json`; `STEP_CLEAR_VIEW_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/step-clear-view-browser.mjs <artifact-dir>`.
