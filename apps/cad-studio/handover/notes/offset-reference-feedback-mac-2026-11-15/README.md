# D1370 — owned Offset reference-plane feedback

Closes #142 within native existing reference-plane scope. Invalid repicks discard only the prior target and preview, never source geometry or distance draft. One Reference plane row owns the refusal; valid selection, mode exit and replaced command/context/values cannot show stale feedback. Extrude end-face toast behavior is unchanged.

## Verification

- Focused feedback tests 10/10, Studio type check, scoped lint and production build PASS.
- Actual Chrome 1024/1440: invalid source selection, Distance transition, nonparallel refusal, invalid repick target removal, valid recovery and Apply, moving reference and History retarget PASS.
- Independent native plane/volume oracle, strict BRep, reference body unchanged, Undo/Redo, downloaded Save/fresh Open and collapsed-file retention PASS.
- Receipt SHA256: `ed5b74ca0448cd9a3dfd57bb551da4919e70e1d7f7c0250c4f66350eb47e41f8` (d1370-second).
- Actual invalid-repick and valid-reference screenshots visually reviewed.

## Limits

Full App lint still reports pre-existing unused `_k`; focused checks are not a full-suite/CI claim. First browser run hit a lingering Distance handle; the driver selected another interior point and passed without a product change. That handle behavior is not claimed fixed. External STEP and assistive technology were not tested. Existing broad geometry/manufacturing HOLDs remain. Subsequent local #143/#127/#150 changes are separate deliveries and not included here.
