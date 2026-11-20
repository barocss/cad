# Copy selected section contours to an independent sketch

P5, [issue #736](https://github.com/barocss/cad/issues/736). On a single section plane, **Section outlines** selects **All**, **Outer only** or **Inner only**. **Sketch the section** opens an independent draft. Finish writes the sketch. Cancel leaves the source document intact. A new section or document starts with All.

The exact section worker records the native cap ID, plane and directed trim loops from the evaluated body. That information travels with the section result and is excluded from saved parts. For one solid and one planar cap with up to two holes, the copy checks the displayed boundary chains and compares the fitted loops against the native lines and circular arcs before applying the filter. A missing, shifted or open hole therefore prevents an outer-only copy as well. Multiple inner loops form separate material regions in the new sketch. Broader valid sections retain the existing All operation.

## Desktop and geometry evidence

The fixed stock measures 40 × 30 × 10 mm. The cut is at Z = 5 mm. The first through hole has centre (10, 9) and radius 3 mm. The second has centre (28, 20) and radius 2 mm. The pre-implementation [baseline and actual Studio images](https://github.com/barocss/cad/issues/736#issuecomment-7041138494) establish the original All behavior. The independent copy threshold for this fixture is 0.0081 mm. It combines the existing fit scale (40 × 0.0002) with 0.0001 mm for rounding.

| Case | Result |
| --- | --- |
| Zero holes | All and Outer only produced one rectangle. Inner only gave a reason and kept the document and section. |
| One hole | All preserved the rectangle and its hole. Outer only produced the rectangle. Inner only produced one closed circle. Its 2 mm extrusion created an independent solid of 56.548667764616184 mm³ (18π), spanning Z = 3 to 5 mm. |
| Two holes | All preserved both holes. Outer only produced one rectangle. Inner only produced two independent loops. The copied corners, circle centres and radii matched the fixture at the precision of the readback. |
| Persistence and ownership | The eight successful combinations passed Finish, Undo, Redo, Save and fresh Open. The source nodes and outputs remained intact. Cancelling the two-region draft created no document history. A delayed worker result could not authorize an older section. |
| Unreadable cap | The harness delivered a real section result with a controlled alteration to its displayed triangles. The added triangles covered one hole while the original native cap retained it. All three choices refused the incomplete outline and preserved the section and accepted document. |

Focused tests also cover a mixed line-and-arc hole, repeated mesh delivery, off-plane and shifted boundaries, a 75-sided outline, multi-body All and a three-hole cap outside the selective range. The independent solid volume threshold is 0.000001 mm³. The displayed mesh volume is a separate approximation.

## Reproduce

Run one heavy command at a time through the local gate. Use the installed Node 22.19.0, Chrome and Playwright. Each browser output directory must be outside the checkout.

```sh
pnpm --filter @barocss/cad-model test section-sketch-profile face-commands
pnpm --filter @barocss/cad-studio-app test section-sketch-copy section-exclusion-session section-view section-planes section-face-pick-escape section-span
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
SECTION_CONTOUR_COPY_SOURCE_FROZEN=1 node test/section-contour-copy-browser.mjs "$CONTOUR_OUT"
D1011_SOURCE_FROZEN=1 node test/section-visible-copy-browser.mjs "$VISIBLE_OUT"
D720_SOURCE_FROZEN=1 node test/thin-section-span-browser.mjs "$DRAG_OUT"
SECTION_SELECTIVE_FROZEN=1 node test/section-selective-instance-browser.mjs "$EXCLUSION_OUT"
```

**PASS** — 20 model and 22 Studio checks, six independent Extrude controls, and four desktop Chrome flows. These include the existing visible-body copy, thin-section drag and placed-instance exclusion flows.

Lint, model type checking and the Studio production build passed. During verification, the package type check also found that the earlier independent Extrude test inferred a read-only selection. The table now checks each input as a command context and values pair. Its six runtime cases passed unchanged.

**FAIL** — The global documentation check reproduced the base revision’s stale refusal table and its unrelated core API inventory difference (44 expected members, 46 actual). The inventory update for this change contains the section additions and their public types.

**NOT_RUN** — Mobile, external CAD and live AI providers. Overall CAD readiness remains unmeasured.
