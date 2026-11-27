# D2067 — Certify two native through holes on a locked-reference plate

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#754](https://github.com/barocss/cad/issues/754) · Base `65481996e7e1c8fed9a11c966b55e6db761011d3`.

A pinned native cylinder inspection gave the axis and radius but could not establish which exterior planes the hole opened onto. Reuse the existing strict two-bore plate admission to report the owning body, rectangular bounds, both exterior cap faces, and the centre, diameter and native wall-face pair for each bore. The product emits `throughBorePlates` only for a certified rectangular plate found through an inspected bore face. Missing evidence means the shape is outside this proof, including the near-through control. This read does not compare the proof against a mesh or change the approval policy. Separate the native face read from view dispatch.

The synthetic 60 × 40 × 5 mm target has a known origin, axes and millimetre scale. The authored requirements are Ø6 at (15, 20) and Ø8 at (45, 20). Tessellate the exact reference recipe for the locked mesh. Use the literal dimensions and the analytic volume as the oracle for the native candidate. The mesh and candidate use the same kernel.

## Verification

- **PASS, desktop Studio and local stdio MCP.** Level 1 creates the locked mesh reference and refuses a direct feature build. A proposal stages a Sketch, an Extrude and two independent Holes. Studio opens the reference with zero model bodies. Preview and Hide preserve the document. Explicit Accept adds one native body and records a user-attributed decision. Edit the left Hole from Ø6 to Ø10, Undo and Redo. Native Save and fresh Open retain both Hole IDs, the right Hole at Ø8 and the exact locked reference. Reopened volume is 11,355.973506014105 mm³, compared with `12000 − 205π`.
- **PASS, distinct native controls.** The approved 11,607.300918301304 mm³ plate has two openings at z = 0 and 5 mm and passes strict B-rep validation. The Ø8 nominal 4.9 mm blind control adds 5.026548245740 mm³, keeps both cylinder diameters, and emits no exterior through proof. The swapped control has the same total volume as the target and emits Ø8 at (15, 20) and Ø6 at (45, 20), which fail the authored location-specific expectations. Each valid bore occupies two native cylinder faces. All four reads retain the source file bytes.
- **PASS, feature checks.** Existing Studio proposal review and tool contract checks pass 17/17. Both type checks, scoped ESLint, browser-driver syntax, Studio production build and diff check pass. Desktop Studio retains 1,268 frozen source hashes through cleanup and logs zero page or console errors.
- **FAIL, initial harness.** The proposal summary rounds volume to three decimal places. The first run compared that display value at native tolerance. The final run checks summary rounding separately and compares exact native volume with the analytic value.
- **NOT_RUN.** Pinned native evidence on the pending plate proposal, equal-budget final-only versus per-feature feedback, wrong-centre/missing-hole/wrong-thickness and scale/open-mesh controls, live providers, mobile and full local suites. #754 stays open. First mechanical CAD remains 8/10. Overall completion remains unmeasured.

```sh
# Node 22.19.0. Use the installed desktop Chrome and Playwright. Acquire the heavy gate before each run.
LOCKED_PLATE_BORE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/locked-plate-bore-browser.mjs "$OUT/final"
pnpm --dir apps/cad-studio test proposal-review-availability toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
