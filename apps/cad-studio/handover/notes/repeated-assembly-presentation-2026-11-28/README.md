# D2083 — Adopt a static assembly review manifest

P3 [row 04](../../roadmap-rows/04.md) and [row 10](../../roadmap-rows/10.md) · [#278](https://github.com/barocss/cad/issues/278) · Base `086218eeeb66bccdf97d971b87d29e4aab5ae89a`.

Adopt the caller-owned manifest for still images. Use exact occurrence IDs, [D2082 saved presentation revisions](../saved-assembly-presentation-2026-11-28/README.md), and separate native requirement outcomes. The driver records each image SHA-256, camera and projection, lights, selected and shown occurrence IDs, step and presentation revision. The assembled image has no active step. The consumer compares an expected scene before it uses the evidence. The product uses its existing Model document and Studio Steps panel.

Cutaway describes a reference checklist and a still-image review before filming. Use that reference-to-shot sequence with BaroCSS native geometry and checks. This test uses a first-party SVG drawn independently of the CAD renderer from the dimensions of the repository's synthetic `assembly-steps.bcad`. No external media assets enter the test. [Cutaway README](https://github.com/Nyxera0x/cutaway/blob/5d8f1c6efe0ed65a8fc7647a7a2a3ee9fbb4d20a/README.md) · [Cutaway checklist](https://github.com/Nyxera0x/cutaway/blob/5d8f1c6efe0ed65a8fc7647a7a2a3ee9fbb4d20a/docs/CHECKLIST.md).

| #278 acceptance | Verified result |
| --- | --- |
| Known assembly and reference | Left `b1` and right `b2` have the same name, definition `block` revision A and local geometry. Their origins are X=10 and X=70 mm. The checklist covers visible block positions. It records the base gauge as a native requirement and internal fasteners as unknown. |
| Occurrence identity, navigation and persistence | Studio selects `b1` on the first step and only `b2` on the second. Next and direct step navigation reach the expected saved scene. A control file omits `b2` and retains its step reference. Studio shows the missing row and disables selection; MCP returns `unresolved: ["b2"]` and no active occurrence. Save retains that state. |
| Assembled, focused and exploded stills | The assembled image shows four occurrences. The same-name blocks have distinct viewport pick IDs at their known top-surface centres. The focused view selects the right block. At ×1 explode, the submitted translation deltas are `[-30,-10,-9.5]` and `[30,-10,-9.5]` mm and both top centres still pick the expected IDs. Fresh Open preserves the transforms. The held-reference shot has no pick at the right sample, so its right-block checklist result is unknown. |
| Native preservation | The accepted document changes only step 2's explode scale. Both original placements and the base-to-post lock mate compare equal. Actual Studio exports before and during explode share the exact 22,092-byte STEP `DATA` section. The native reader returns five strict closed solids. Independently calculated envelopes and volumes agree within 0.00001 in mm and mm³. Volumes are 24,000, 4,000, 4,200, 1,080 and 4,000 mm³ in minimum-X order. |
| Stale controls | The old presentation revision refuses eight controls: replaced reference digest, replaced checklist digest, placement edit, step membership swap, camera edit, document visibility edit, old explode scale and missing right occurrence. Editing only the final step's note preserves the second step's revision. |
| Visual and native verdicts | Visible blocks pass the outline checks. The production native requirements tool measures a 4 mm base against the deliberate 5 mm requirement and returns a hard failure. It reports an unknown internal bore. Both outcomes persist through explode, and `hard_fulfilled` stays false. |
| Existing work | [#207](https://github.com/barocss/cad/issues/207) owns authoring, camera, navigation and replay. [#209](https://github.com/barocss/cad/issues/209) owns tour controls; it is the transferred #2270. [The #2222 research record](https://github.com/barocss/barocss/issues/2222) separates bounded visual checks from native approval. #278 adopts their static handoff through the saved revision, source checklist and exact occurrence IDs. |

**PASS.** Actual desktop Chrome WebGPU, local stdio MCP, two STEP exports, native readback, browser syntax, scoped ESLint, 24 Model tests and diff checks. The desktop run retains 1,268 frozen source files and reports zero source changes, page errors and console errors.

**FAIL.** The first driver's native comparison included a session telemetry field. The corrected check compares native results and checks the policy outcome independently. An early ×0.5 view partly covered a block with the base; the final ×1 view and top-centre pick samples distinguish both blocks. The 4 mm gauge failure is the intended native control.

**NOT_RUN.** Time-based rendering, animation, freeform or occluded feature recognition, full local suites, mobile and live providers. The research decision covers static top-level review only. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

The reference SVG SHA-256 is `ee935c7fd5cfe1517f8a171d0a420e730e840a79bcf5cb8b909ad9f20c8f1fc2`. The checklist SHA-256 is `724861984ad14c3fc8ad17664c50ad9ac177077d04aba366ff61485fab365f07`. The STEP data SHA-256 is `b5e9de1ae0ad24d4c04f99a6b183ab7880bbca33c091834e29b74a6f06b8647e`.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run.
pnpm --dir packages/barocss-cad-model test assembly-steps assembly-step-query
REPEATED_ASSEMBLY_PRESENTATION_FROZEN=1 node apps/cad-studio/test/repeated-assembly-presentation-browser.mjs "$OUT/review"
```
