# D2070 — Connect two offset circular pipe ends with an open transition

P5 [row 07](../../roadmap-rows/07.md), [row 08](../../roadmap-rows/08.md) · [#752](https://github.com/barocss/cad/issues/752) · Base `3419793a4133b109bd084e63bab08614c2d0c3e7`.

The existing ruled Loft and Subtract commands produce the requested hollow transition. The fixture has two independently authored straight pipes. Their mating faces are parallel XY planes, separated by 30 mm, with an 8 mm centre offset along X.

## Reproduce in Studio

1. Use an inlet with outer/inner diameters 24/20 mm on `z = 0` centred at `(0, 0)`. Use an outlet with outer/inner diameters 16/12 mm on `z = 30` centred at `(8, 0)`. The source pipes extend away from the transition span.
2. Draw a separate circular sketch for each outer profile and each bore at the matching height. Use the same centre for the two circles at each end.
3. Select both outer sketches, choose **Loft**, and **Apply** the two-section ruled preview. Repeat with the two bore sketches to create the inner Loft.
4. In the Browser, select the outer Loft first and Shift-select the inner Loft. Choose **Combine → Subtract**. The Browser shows the original two pipes and the new transition as three bodies.

## Verification

- **PASS, exact cross-sections.** The native ends measure 24/20 mm and 16/12 mm. At `z = 15`, the native outer and inner surfaces measure radii 10 and 8 mm about `(4, 0)`. The measured minimum in that section is 2 mm. All four outside and four inside rational side patches are linear in height with matching normalized end control points. The measurement is radial in a section. The sloping walls can have a different normal distance.
- **PASS, continuity of the passage and solid.** Both annular caps have outer and inner loops. Their reciprocal rim edges lead to the same four inner walls and the same four outer walls. A strict native check finds one closed genus-one shell with 16 vertices, 24 edges, 10 faces and 12 loops. Maximum edge-to-surface gap is `8.58e-15 mm`. The volume is `1080π = 3,392.9200658769655 mm³` from the difference of the circular areas integrated over the span. The 256-triangle diagnostic mesh has one closed piece, zero inconsistent or non-manifold edges and zero detected self-intersections. This finite diagnostic supplements the ruled native chart and trim checks.
- **PASS, desktop Studio.** Build and preview both Lofts. Apply Subtract using the two intended Browser rows. Undo restores both Lofts and Redo restores the hollow solid. Stage the same Subtract through local MCP at autonomy level 1. Preview the complete result with the document unchanged. Explicit user Accept reproduces the direct result. Undo/Redo and native Save and fresh Open preserve the exact transition and both source pipes. The two original pipe digests remain unchanged. The desktop run retains 1,257 frozen source hashes through cleanup with zero page or console errors.
- **PASS, focused checks.** Focused Model checks pass 13/13. Studio type check, scoped ESLint, browser-driver syntax and diff check pass.
- **FAIL, alternatives and harness.** A native two-opening Shell probe with a 2 mm setting refuses on the thin-wall guard. The first desktop harness stored pipe names under the terminal Hole keys. The native proof passed, but the Browser uses the original Extrude keys for body names. The final run uses those keys and checks the stable output IDs. An initial type check also caught a widened side literal in the fixture. The final fixture supplies the original solid side directly.
- **NOT_RUN.** Nonparallel or guided transitions, uniform normal thickness, tangent matching to the original pipes, fused or manufactured output, full local suites and mobile. The qualified profile closes the original #752 scope. First mechanical CAD remains 8/10. Overall completion remains unmeasured.

The transition key is `b16`, with native SHA-256 `27eb8e84b0ab3643d94c7029d1f2329191b94ab903708811152d1628d55562ad`. The source pipe keys are `b2` and `b5`. Their volumes remain `352π` and `224π` mm³.

```sh
# Node 22.19.0. Acquire the heavy gate before each run.
pnpm --dir packages/barocss-cad-model test api-multi-conic-loft loft-legacy-label subtract-operands-history
tsc --noEmit -p apps/cad-studio
OFFSET_PIPE_TRANSITION_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/offset-pipe-transition-browser.mjs "$OUT/final"
```
