# Ordinary terminal Hole end mode (#677)

Original main `c75cb9199`: actual Top face → Hole Through, diameter4, centre20/15 in 40×30×12 stock. History has neither an end selector nor Depth. A saved blind6 Hole has Depth only. Storage already supports omitted depth for Through and positive numeric depth for To a depth. Original Chrome/native baseline confirmed this bounded editing gap, not data loss.

## Scope and behavior

History now offers Ends only for the final ordinary single Hole with numeric dimensions and a solid non-Hole parent. Thread, pattern, countersink/csk, made, held/suppressed, route members, bound dimensions, invalid numbers and any following node are excluded. End changes alter native faces, so downstream-reference cases are deliberately not admitted. Entry face, axis/side, centre, radius and parent stay unchanged. No schema or kernel admission expansion.

Through → To a depth explicitly starts a draft at the existing creation default 6 mm. Guidance asks the user to check Depth before Apply. Through removes the depth property. Repeated switching clears only discarded Depth typing. The frozen-field drag HUD deliberately omits this new choice; existing numeric drag editing is unchanged.

## Verified evidence

- Original unit checks: 2 PASS / 4 RED before implementation. Final focused checks 7/7 PASS, combined Hole end/thread/depth/type regressions 21/21 PASS. Setter rechecks current eligibility; test coverage includes all axes/sides, reference preservation, invalid options, disallowed categories and unchanged numeric HUD editing.
- Frozen actual new path PASS twice: default6, typed9 → Through → To a depth resets6, apply8, exact document preservation except depth; Undo/Redo; 0, negative and blank refusal preserving accepted8; changed5 Cancel; restore Through; both modes native Save/fresh Open and re-opened controls.
- Existing Blind depth regression PASS at 1024 and 1440 px; existing tapped legacy regression PASS through placement/depth edit, Undo/Redo, Save/fresh Open, Through readout, and named underside viewport depth direction. Threaded Holes never offer the new end selector.
- Actual source capsules unchanged, zero browser errors, owned browser/context/server cleanup confirmed. Scoped ESLint, diff checks, Studio tsc --noEmit and Vite build PASS (6.98 s). Screenshot content visually inspected.
- Independent stock-minus-cylinder volumes: 14400 − pi×2²×depth, with depth12 for Through and8 for blind. Strict native single B-rep, inward cylinder radius2 at XY20/15, Z axis, native bore vertices Z0..12 versus4..12 and displayed volume all checked. Saved files retain diameter4 and named entry n1.top.

## Retained failures and limits

The first baseline ended before receipt and remains NOT_RUN; low free disk space was observed, not proven as its cause. Only explicitly approved owned Vite caches/dist were removed, never source or evidence. A new baseline passed after space recovered. The execution gate has load limits but no disk floor; this task additionally required at least2 GiB. Final checks finished with over20 GiB available.

The initial tapped regression stopped at a stale assertion requiring Ends and Thread text to be adjacent. Original HEAD already has a Thread guidance paragraph between them. After the blind assertion was corrected, the same Through assertion stopped a second run. Both were changed to independent exact semantic readouts, plus exclusion of the new selector. No product behavior was changed to satisfy the fixture. The final entire tapped run passed; failed runs and pre-build NOT_RUN states remain locally retained.

Actual consumer coverage is this Top Z plain Hole, plus the existing Blind/tapped regressions. Unit axes/side tests are not a claim of arbitrary native geometry coverage. No downstream topology rematching, cosmetic-thread end conversion, arbitrary manufacturing support or broader CAD parity. Existing HOLDs and doc-sync pause remain; this is task-local verification.
