# D1336 — Preserve Varying Fillet radius-mode draft (#119)

## Implementation

Active.fillet stores an ephemeral varyingDraft of raw endpoint and interior-station values. Varying→Constant captures it before the effective builder inputs become endRadius0/stationMode ends. Returning to Varying restores it exactly, while the shared starting radius remains the current edit. Blank/zero/negative input is not silently normalized. First entry retains existing default behavior. New command/type replacement does not inherit the draft. Original preview retirement and pending-Apply clearing stay unchanged. Nothing is added to saved nodes, Model APIs or native builders.

## Independent Mac verification

- Fillet-family18/18 PASS:1→3 roundtrip, repeated mode changes, current start-radius edit, raw invalid values, interior controls, Constant actual build, command lifetime/type reset, prior selection/preview ownership coverage.
- Studio type-check, changed focused lint, production build and diff check PASS.
- Actual Chrome1024×900 and1440×900,30×12×20Box front/top edge: three Constant/Varying roundtrips retain1→3 and never change document. Apply produces exact native edge name and radii[1,3]; History mode is Varying. Undo/Redo and Save/freshOpen preserve it. Separate Varying3→Constant Apply produces radius1 without radii and History mode Constant. Ephemeral draft is absent from node data.
- Actual1024px restored Varying screenshot reviewed. Driver test/fillet-mode-draft-browser.mjs receipt SHA256 `6db293f2a79f18b6f41832edf3afde2c6dee4e769522ee8bf3326d0c651b0bd4`.

## Limits / next

This delivery preserves radius-mode drafts within Edge Fillet. Edge/Face/Full-round type changes retain their previous reset semantics, not cross-type draft retention. Interior/invalid cases are unit-tested, not browser-tested. Other shapes, AT/mobile and full suite NOT_RUN. CI not awaited; all HOLDs and baseline generated-doc drift persist. Next D1337/#137: investigate tiny Scale empty-solid admission and enforce a justified geometry boundary without a blanket arbitrary scale minimum.
