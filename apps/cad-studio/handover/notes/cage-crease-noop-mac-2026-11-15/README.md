# D1327 — Preserve history for no-op cage creases (#559)

## Implementation

`packages/barocss-cad-model/src/subd/cageEdit.ts` always invokes native setCreases, then compares canonical undirected crease sets. An unchanged result returns the original session identity, preserving selection, cage, Undo and Redo. Mixed selections with a real change retain exactly one normal step. Native invalid-edge and empty-selection refusals remain intact. Studio geometry and commit handlers are unchanged.

## Independent Mac verification

- New Model tests5/5 and related cage regression tests23/23 PASS, including reversed/duplicate edges, face sides, mixed changes, Undo/Redo and invalid input.
- Model/Studio type checks, focused lint, production build and diff check PASS.
- Actual public30×20×16 box with4 subdivisions at1024×900 and1440×900: Smooth on smooth edge adds no step; Done retains clean document and its existing history; repeated Crease adds no step; Smooth after Undo preserves Redo; mixed sharp/smooth two-edge selection changes once and preserves coordinates/selection.
- Actual cage and document Undo/Redo, native Save and fresh Open PASS. Mixed-selection screenshot visually reviewed.
- Driver: `apps/cad-studio/test/cage-crease-noop-browser.mjs`. Model regression: `packages/barocss-cad-model/test/cage-crease-noop.test.ts`.
- Final frozen browser receipt SHA256 `c25746123bc9a27ba91408284a5925d4f1ea654a4e6f08dfec9251dea11b7c3c`.
- Earlier driver attempts incorrectly assumed Open creates no history and selected through a gizmo handle. Assertions/target were corrected; neither was a product defect.

## Limits / next

Full suites, mobile/AT and arbitrary cage families NOT_RUN. Existing unrelated lint/generated-doc drift remain separate; CI not awaited. All HOLDs persist. Next D1328/#560: identify individual selected sharp/smooth edges without obscuring selection or adding a permanent explanation area.
