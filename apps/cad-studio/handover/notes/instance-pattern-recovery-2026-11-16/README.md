# Instance Pattern refusal recovery (#73)

The App pattern commit adapter now returns the actual model refusal. Creation/edit controls retain draft values and show one inline status, associated with the group, instead of closing after a failed submission. Input changes clear the stale refusal; only accepted creation closes the draft. Existing non-form callers retain toast errors. Commit rejection also keeps the draft. Model pattern rules and placements are unchanged.

Validation:
- TypeScript/Vite production build PASS (`/tmp/cad-pattern-recovery-build.log`).
- Pattern draft unit tests 2/2 PASS (custom axis preservation).
- InstancePattern component and browser driver lint PASS. App lint retains the pre-existing unused `_k` error, now line 2431; not a whole-file lint pass.
- Extended `test/instance-pattern-browser.mjs` PASS (`/tmp/cad-pattern-recovery-r2-20261116`). Actual Chrome WebGPU at 1024×800 and 1440×900: Linear count 2.5 / spacing 25 and Circular count 4 / angle 91 / Z each refused twice with form and document intact; inline single error; recover count 3 / angle 90; independent Python placement oracle; invalid edit retained accepted document; Undo/Redo; real Save and fresh Open.
- Existing full driver also passed: Skip/Restore, count edit, seed movement, removal refusal, BOM, pattern deletion, circular placements and mated seed re-solve. Narrow refusal screenshot visually inspected.
- First added test pass failed because of incorrect freshOpen helper arguments, after successful model refusal/recovery/Save; corrected and full test rerun passed.

Limits: no new assistive-technology, arbitrary axes, patterns of patterns, or aggregate suite qualification. #126 protected WIP untouched.
