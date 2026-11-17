# #659: explicit new-part placement admission

Baseline grouped dispatcher `assembly/add_part` and `assembly/insert`, using the actual evaluator, accepted explicit position `[40,20]`, returned changed true / isError false, and placed a new part at `[0,0,0]`. The documented xyz schema requires three numbers; existing place_part rejects malformed explicit placement.

New-part commands now refuse explicit malformed position/rotation before copying, inserting, evaluating or mutating the document. Omitted/undefined values retain the existing origin/zero-rotation default. Valid finite vectors pass unchanged. The shared general vec3 guard and other commands are unchanged. This is a tool boundary fix, not a claim that numeric UI controls emit these malformed inputs.

## Verification
- Baseline 2/2 expected-refusal tests failed with actual wrong origin placement.
- Focused placement + route-admission regression 9/9 PASS, including 36 invalid combinations (position/rotation, two commands, nine malformed shapes/nonfinite/sparse cases). Invalid calls perform zero evaluation and retain the input.
- Valid and omitted cases preserve placement and native roundtrip.
- Model type and scoped lint PASS.
- Actual Chrome consumer first run PASS: all four dispatcher results Open in Studio; valid copies/library inserts show [80,20,12] mm and [0,0,90] degrees, Reset placement/Undo/Redo and native Save/fresh Open work. Refused result documents remain the original part. Screenshots reviewed.
- 1298 frozen source hashes unchanged through run/cleanup.

The browser receives dispatcher result documents through real native Open; malformed requests are executed by the inspector with the actual dispatcher/evaluator, not entered through the numeric UI. Existing HOLD and broader PDF/lint limitations remain outside this change.
