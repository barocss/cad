# D2080 — Propose a four-part native draft from two reference views

P1 [row 04](../../roadmap-rows/04.md) and [row 08](../../roadmap-rows/08.md) · [#747](https://github.com/barocss/cad/issues/747) · Base `babb5a50c9cb6c39dbf3aad66c089845e26a6293`.

`image.propose_pair` checks the `traceRevision` from `image.measure_pair`. It compiles the four paired outlines to existing assembly and feature operations. The front opening becomes two circular arcs in a circle sketch. The side profile sets the extrusion depth. The handle, filter cap and button use rectangular sketches and separate extrusions. Front image X maps to world X and right-side image X maps to world Y. The proposal records the supplied diameter, estimated draft sizes, estimated aperture, unknowns and trace digest. The saved proposal replays without the images or a model provider.

Studio previews appended instances in the current view without adding them to the accepted Browser. The existing assembly approval is required. Stored operations check their expected new instance IDs before adding any feature. If another edit takes a reserved ID, the proposal must be regenerated.

## Verification

- **PASS, local Studio Chat and MCP.** Actual image attachment and a scripted local client stage a trace-pinned proposal. Focused checks refuse a stale trace, missing side depth, inconsistent views, Agent acceptance and a rebase that would assign the first occurrence to an existing companion. An unrelated base solid survives the controlled proposal replay unchanged.
- **PASS, desktop Chrome WebGPU.** Fresh Open of the pending `.bcad` previews four placed native parts while the accepted document remains empty. Show before and Hide leave it unchanged. Explicit Accept creates the Ring head, Handle, Filter cap and Button. Undo restores the pending proposal and Redo restores all four instances. The Button visibility test leaves the other instances unchanged. The source-frozen run recorded 1,601 hashes through cleanup and no page or console errors.
- **PASS, separate edits and native retention.** The Ring head starts with an 84 mm outside diameter and an approximately 55.917 mm opening. Discard restores the original diameter. Finish changes the outside diameter to 88 mm while keeping the measured 84 mm source in the approval record. The Handle length changes separately from 63.04691 to 68.04691 mm. Both edit targets, the Filter cap and the Button have one strict closed solid each. The companion native bounds, volumes, placements and IDs stay fixed. Actual Save and fresh Open retain the edited assemblies and confirmation history.
- **PASS, feature checks.** Sixteen Model and nine Studio focused checks pass. Scoped ESLint, Model and Studio type checks, both browser driver syntax checks, diff check and Studio production build pass.
- **FAIL, initial checks.** Raw feature validation requires two segments for a circular hole, so the initial one-segment recipe refused. The first desktop edit test needed to confirm Discard. The type check caught an optional error branch in the draft response. The old vertex-only bounds receipt also missed the circle's Y extremes. The final run uses the two-arc recipe and curved-edge bounds.
- **NOT_RUN.** STEP interchange for this draft, real photos, paid live models, full local suites and mobile. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution and the feature build.
PHOTO_PAIR_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/drawing-image-intake-browser.mjs "$OUT/final" --photo-draft
pnpm --dir packages/barocss-cad-model test photo-pair-draft toolset tool-contract
pnpm --dir apps/cad-studio test instance-evaluation toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
