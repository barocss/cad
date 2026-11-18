# #713 — effective occurrence material in public meshes

Baseline main 170b83744: a definition with al6061 is placed twice. Actual Studio Appearance sets Pin to Steel (mild). partLooks confirms steel while Assembly.meshes on the same opened document returns al6061 for both. The original definition and other occurrence remain unchanged. The image demonstrates actual UI input, not a rendering-color defect.

The assembly mesh reader now uses existing lookTargetsOf/looksOf on the same evaluated bodies, preserving translated/nested body-key ownership. Only a nonempty effective material overrides the existing materialIdOf fallback. The unchanged body→MeshData conversion is shared internally to avoid evaluating geometry twice. No new public barrel API, color handling, or hidden-body filtering policy is added.

Final verification: focused plus api-assembly/api-verbs/instance-looks/#708 regressions 60/60; actual Chrome Material selection, Undo/Redo, Save and fresh Open PASS; Model/Studio TypeScript and owned-file lint PASS. Nested inner/outer overrides, reset, explode, hidden host/body policy, undefined/brief/legacy-empty fallback and copied arrays are covered. Fixed meshes are p1/b1 steel and p2/b2 al6061. Frozen changes=[] and contexts/browser/server cleanup verified.

First fixed browser and 59 tests passed, but its Model type check exposed a test-only missing Brief.version. Independent review also identified an empty saved material fallback regression; a focused failing test reproduced it before the guard was corrected. Final frozen fixed-02 reran all checks successfully. Baseline's material mismatch was an expected FAIL.
