# Exact custom assembly-step explode scale

Baseline `d4362e046`. Source inspection found Model accepts any scale in [0,2], while Steps offered only 0/0.5/1/2. An imported .75 had no matching option despite its presentation being applied. The select now includes the exact current value. A separate scale draft supports explicit Set scale/Enter, validates the existing inclusive range, rejects blank instead of turning explode off, and Escape cancels. Switching steps discards an unfinished draft. Preset selection remains intact. No Model/schema/kernel change; placement and geometry are not edited.

## Verification

- Studio focused10/10: existing assembly display/state8 and new draft/options2. Exact precision, limits and presets checked.
- Studio type, targeted lint, diff check PASS.
- Actual Chrome first run PASS. Synthetic existing four-part fixture with two steps at .75 and1.25: imported .75 appears correctly; blank/-0.1/2.01 refuse unchanged; Escape restores .75; explicit1.125 updates only the step; Undo/Redo and switching steps discard pending .2; actual native Save download/fresh Open retains1.125. Preset0.5 and explicit0/Off still work. Closing Steps does not edit the document. Nodes/instances/mates remain identical to the fixture.
- Screenshot directly reviewed: current1.125 displayed in selector, numeric input and Explode label. One active block is partly offscreen; this is not a fit-all visibility qualification. No console/page errors or frozen-source mutation.

NOT_RUN: pre-fix browser reproduction (source-confirmed absent option), playback, nested step authoring, arbitrary document transitions, new explode geometry accuracy/fit guarantee, export qualification. Existing HOLDs retained. #207's broader remaining work stays open.

Run `node apps/cad-studio/scripts/test.mjs step-explode-draft assembly-steps`; `node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json`; `STEP_SCALE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/step-explode-scale-browser.mjs <artifact-dir>`.
