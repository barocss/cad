# D2082 — Read a saved static assembly presentation from the local Agent

P3 [row 04](../../roadmap-rows/04.md) and [row 10](../../roadmap-rows/10.md) · [#278](https://github.com/barocss/cad/issues/278) · Base `519f6d14c81e9c21c5b210a98992cc507ab72f8d`.

Use the accepted synthetic [D2080 native draft](../two-view-native-draft-2026-11-27/README.md) and its reference trace. Read one static assembly presentation through the existing local MCP `assembly.get` action. Set `include_steps: true`, specify a zero-based `step_index`, and add a `step_presentation` object. The older membership-only request keeps its response. Step names and occurrence IDs keep their literal values.

The report includes the saved camera or null, the display-only explode scale, installed and active occurrences, and waiting and unresolved IDs. It lists which top-level occurrences the saved step permits in a view with waiting occurrences hidden. Body-level visibility and occlusion still depend on the scene. The saved camera records its up vector. Studio's orbit camera uses its fixed up convention and retains the current field of view and projection mode.

Supply the reference and checklist SHA-256 digests when the caller has evidence to bind. The tool records them as caller inputs. The presentation revision hashes the returned step state, camera, explode scale, evidence digests and model revision. The model revision covers the authored document except root history, proposals and assembly step records. A change to another step's note or explode value does not change this presentation when membership and the selected step stay the same. Pass the prior `expected_revision` with the same evidence to check validity. A mismatch returns `STEP_PRESENTATION_STALE` before geometry evaluation.

## Verification

- **PASS, actual desktop Chrome WebGPU and stdio MCP.** The assembled draft shows `p1`–`p4`. At step 2, the renderer submits `p1` installed, `p2` Handle and `p3` Filter cap highlighted, and `p4` Button hidden as waiting. The submitted eye and target match the saved values `[340,-427,-77]` and `[0,0,-85]` to 0.00001 mm. Studio changes the saved explode scale from 0 to 0.65. The three parts' submitted Z offsets are +21.99497, −20.26737 and −46.50912 mm. Native instances, base nodes, mates and accepted proposal remain unchanged. Undo and Redo restore the respective documents. Fresh Open restores the exact IDs, camera and submitted transforms. A second Save emits the same bytes. Source freeze covers 700 files with zero file changes, page errors or console errors.
- **PASS, provenance and stale controls.** The checklist pins the D2079 reference trace `737a65a47af9084d818d1a74d38769c288589c3ae69bb442a32356435d90bcf6` from the accepted proposal. It records the handle and cap outline positions and marks cap threads and fit unknown. In the actual MCP session the pre-explode revision and a changed checklist digest both produce `STEP_PRESENTATION_STALE`. The fresh saved revision is `8eef9ad7c2bb9ef0ce54a84136a937a163f6c9bb5045bab05feabf10bf23b895` and reads back unchanged after reopen.
- **PASS, scoped checks.** The 25 Model tests verify call compatibility, malformed inputs, same-definition occurrence IDs, unresolved IDs, and stale changes to geometry, placement, visibility, camera, scale, membership and reference digests. The Model tool-list and system prompt use 24,952 of 25,000 characters. The five Studio MCP contract checks, scoped ESLint, Model and Studio type checks, browser driver syntax, diff check and Studio production build pass.
- **FAIL, initial evidence framing.** The first camera clipped the cap in the exploded capture. The final saved view shows the complete ring, handle and cap both before and after reopening.
- **NOT_RUN.** A same-definition pair on the actual reference fixture, native engineering acceptance, lighting and pixel-based checks, live models, full local suites and mobile. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run and the production build.
pnpm --dir packages/barocss-cad-model test assembly-step-query toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp
PHOTO_ASSEMBLY_PRESENTATION_FROZEN=1 node apps/cad-studio/test/photo-assembly-presentation-browser.mjs "$OUT/review" "$D2080_OUT/final/photo-draft-edited.bcad"
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
