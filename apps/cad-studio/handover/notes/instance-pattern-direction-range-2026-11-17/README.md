# Stable finite direction normalization for instance patterns

Baseline `d5124b77c`. This fixes an existing Model/API/file admission boundary, not a new domain expansion. Patterns accept finite nonzero direction/axis components irrespective of magnitude. Their magnitude must not affect spacing or rigid rotation. Extreme values are uncommon in manual work but can arrive through APIs/files and the now-explicit Custom fields.

## Reproduction

Baseline focused6 tests:4 FAIL/2 PASS. `MAX_VALUE` in all three components overflows `hypot` to Infinity: a linear copy remains on its seed; 120-degree circular rotation sends [12,0,0] to [-6,0,0] instead of [0,12,0]. At `MIN_VALUE`, the rounded subnormal norm produces incorrect spacing and a non-unit rotation axis. The 1e-310 control passes the declared coordinate tolerance.

The first draft mistakenly passed an object to the string-based file reader; this harness error was corrected before the retained baseline6 result.

## Correction

Only overflowed/subnormal norms use max-component rescaling before normalization. Ordinary finite normal norms retain the exact previous arithmetic path. Authored vectors remain unchanged, including through native read/write. Zero/nonfinite inputs keep the existing rejection. Private `assembly/patterns.ts` helper only; no kernel, schema or public API change.

## Verification

- Model33/33 PASS: existing26 plus7 new tests. Literal linear positions and 120-degree cyclic permutation matrices, positive/negative components, stable IDs, source preservation, add/edit/read/expand, existing invalid-input refusals.
- Actual Chrome first run PASS: MAX_VALUE³ creation → MIN_VALUE³ edit → Undo/Redo → actual native Save download/fresh Open. Both have copies[10,10,10]/[20,20,20] for spacing10√3.
- Model type, targeted lint and diff check PASS. Screenshot directly reviewed; synthetic geometry only.

NOT_RUN: actual circular extreme-axis browser flow (Model-tested), arbitrary mixed extreme ratios, new rotation accuracy guarantee, nested/mated cases or exchange export. HOLDs unchanged.

Run Model: `node packages/barocss-cad-model/scripts/test.mjs instance-patterns instance-pattern-direction-range`. Browser: `PATTERN_RANGE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-direction-range-browser.mjs <artifact-dir>`.
