# #707 — Independent Draft Angle is numeric-only

Qualification base `7568ddd5937373a38e6e29db701c7b179feee2fb`; integrated after disjoint #708/#709 through `b8bc69790`. Existing #95 fixed Extrude's Draft field, not this independent `kind: draft` feature. This change adds only `draft` to the numeric-only Angle binder exclusion in `app/editFields.ts`. Numeric getter/setter, native admission, Neutral coordinate Dim binding, Edit Draft command and viewport Gizmo are unchanged.

## Actual original UI

Open a saved synthetic box20×20×10 with a side0 Draft10°, pullZ, neutral0 and parameters Angle12/Neutral−2/BadNeutral2. History offered Angle parameter. Selecting Angle emptied the displayed numeric input and Apply returned native INPUT (angle must be a number), preserving the exact accepted document, history and native geometry. **This is a misleading offered operation, not data loss.**

Numeric12° edited successfully. BadNeutral+2 is a different, correct geometric refusal: for +Z the neutral plane must be at or below this face's bottom0. Neutral−2 bound successfully, with Undo/Redo and actual Save/fresh Open. It was not used to claim support for Angle binding.

## Fixed actual and regression results

- Angle parameter is absent; Neutral coordinate parameter remains. Numeric10→12→8, each Undo/Redo PASS.
- Invalid45° and0° cannot alter the accepted result. Correcting the draft and Cancel preserve the original.
- Binding Neutral−2, subsequent numeric Angle12→8, each Undo/Redo, bad Neutral+2 refusal/recovery and actual Save/fresh Open retain the binding and parent/faces/pull.
- Strict native B-rep and independent geometry checks PASS: side0 is `y=(z-neutral)*tan(angle)`, box cross-section integration gives `V=200*(20-(5-neutral)*tan(angle))`. Positive-angle UI cases have eight uniquely matched corners (1e−8mm) and volume error below1e−7mm³, also compared with displayed mass. No tolerance was relaxed.
- Existing actual Draft Neutral recovery and Draft Angle boundary workflows PASS (including their own real creation/Edit Draft paths and two desktop sizes). All four browser runs including baseline have zero page/console errors, no frozen-source changes and full context/browser/server cleanup.
- Model tests separately cover negative−8° and supported Neutral binding. Outward Draft legitimately retains extra split vertices; an initial test assumption of exactly8 vertices was corrected to required physical corners, all native vertices inside independently specified halfspaces and the same volume tolerance. This is not a geometry repair or a negative-angle UI qualification.

Original focused new tests:3PASS/1RED at the unwanted binder assertion. Fixed new4 plus existing11 tests:15/15PASS, rerun after integration. Scoped ESLint, syntax, diff check and independent review PASS. Model/Studio types and production build PASS (6.21s). Disk monitored42.5→42.4GiB above2GiB reserve. Exact commit CI and public-image rendering are recorded on the issue.

## Reproduce and limits

Node22.19.0. From `apps/cad-studio`, under the coordinated heavy gate:
`DRAFT_ANGLE_BINDING_SOURCE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node test/draft-angle-binding-browser.mjs <new-output>`.
Use `--baseline` only against original product source. Model: `pnpm --filter @barocss/cad-model test draft-angle-binding draft-command-pull api-draft-pull extrude-draft-binding`.

This uses saved synthetic data, not customer files. New actual tests do not claim pointer-created Draft or all draft families. Full suites, mobile, other browsers and assistive technology are NOT_RUN. Existing HOLDs and paused doc-sync remain unchanged.
