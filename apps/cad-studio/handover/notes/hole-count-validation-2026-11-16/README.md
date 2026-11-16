# Hole pattern count validation (#84)

Hole creation no longer rounds Count: row/circle counts must be integers from 2 to 64. Choosing One hole explicitly still ignores the hidden pattern draft. History Copies has an integer range of 1..64 and rejects fractional, zero, negative, non-finite and excessive values rather than rounding or clamping; typing 1 is an explicit single-hole choice. The creation field shows the whole-number range and invalid state; History retains its adjacent range even while an invalid draft disables Apply. Invalid values do not replace the current document.

Chrome WebGPU PASS at 1440x900 and 1024x900: creation 2.4/0/1/65 refuses without a document change; valid 3 creates the exact [8,12], [16,13], [24,14] row; History 2.4/0/65 disables Apply; explicit 1 retains [8,12], with strict native B-rep, independent volume/centroid and Undo/Redo. Existing spacing refusal/recovery, changed centres, Save/fresh Open and exact History fields also pass.

Model hole-type tests 6/6 PASS, including creation/history boundaries for row/circle and through/counterbore recipes, no hidden-count constraint in One hole mode, exact legal counts and no-op invalid setters. Changed-file ESLint and Studio TypeScript/build PASS. Model count admission is distinct from later geometric feasibility; 64 copies are not claimed to fit this fixture.

Run `D1181_SOURCE_FROZEN=1 ... node apps/cad-studio/test/hole-row-history-browser.mjs OUTPUT WIDTH`; model `node scripts/test.mjs hole-types`. Circular/counterbore boundary cases were unit-tested, not interactively requalified; assistive technology and full repository suite NOT_RUN. No schema or existing-file normalization change.
