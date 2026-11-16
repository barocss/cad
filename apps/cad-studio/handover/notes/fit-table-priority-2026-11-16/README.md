# Fit-table replacement priority (#35 partial)

Cause: shared row editing removes incoming IDs then appends replacements. Fit lookup uses the first matching table, so reimporting an existing table silently moved it behind overlapping tables. The fit-specific edit now preserves existing order for replacements, appends new IDs, and still honors explicit removal. Other row-edit callers are unchanged.

Library now explains first-match priority, same-ID replacement, and (over, upTo] size ranges.

Validation:
- Priority/boundary regression 1/1: reimport, changed table content, H7 at 18 and 18.001, new IDs, removal and source immutability.
- Existing fits 3/3 and drawing-tolerance-printable 8/8, including new Ø12.7 ±0.254 symmetry regression in mm and inch.
- Focused lint and Studio typecheck/build pass.
- Frozen Chrome WebGPU 1024/1440: actual JSON reimport retains order, visible priority explanation, Undo/Redo and Save/Open pass. `/tmp/cad-fit-priority-20261116`; reimport-1024 visually reviewed.

PDF audit (NOT a full pass): existing drawing-missing-fit-pdf browser reached actual restored-fit.pdf generation but stopped at `spawnSync pdfinfo ENOENT`. No pdfinfo at standard Homebrew paths. Independent literal-text assertion expecting exact authored limits failed: PDF says Ø8 THRU H7 (+0.015/+0.001) (est.), against authored lower 0. The existing regression allows this conservative 0.001 narrowing; exact interval agreement remains to investigate. Page geometry, continuation-sheet checks after the failure, and PDF rendering not verified. Artifact `/tmp/cad-fit-pdf-audit-20261116/restored-fit.pdf`.

#35 and #44 remain open. No ASME/PDF implementation or held #126 WIP changed.
