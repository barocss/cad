# Keep section controls with their editing state

The Studio shell at 138d72c62 contained both the section exclusion state hook and a separate implementation of the panel controls. Each new exclusion action required another change in App.tsx. The hook now owns the available choices, display names, refusal reason, exclusion and restoration. The shell supplies the selected instances, current-document check, model readiness and notice callback. A delayed callback still checks the current section and document before applying a change.

The section contour reader now returns a complete independent sketch draft with its face plane and contours. App.tsx still checks the current worker result and document edit permission before opening the draft. It coordinates the notice, selection, sketch and camera with the same ordering as the previous implementation. App.tsx decreased from 4,033 to 4,023 lines. The panel consumes the same control type that the hook produces.

## Qualification

The focused tests exercise stale document and plane callbacks, ambiguous and nested selections, restoration while the model is busy, and draft construction. The frozen Studio contour flow checks All, Outer only and Inner only, including the previous worker response arriving late. The placed-instance flow checks visible and clipped occurrences, restoration, project Save and fresh Open. The CPU section path in that flow is forced for comparison in desktop Chrome.

Use Node 22.19.0 and run each heavy check through the local gate. Put both browser output directories outside the worktree.

```sh
pnpm --filter @barocss/cad-studio-app test section-exclusion-session section-sketch-copy section-view section-span
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
SECTION_CONTOUR_COPY_SOURCE_FROZEN=1 node test/section-contour-copy-browser.mjs "$CONTOUR_OUT"
SECTION_SELECTIVE_FROZEN=1 node test/section-selective-instance-browser.mjs "$EXCLUSION_OUT"
```

The focused suite passed 15 tests. Lint and the Studio type check and production build passed. Both frozen desktop flows passed. All eight accepted contour cases completed Finish, Undo, Redo, Save and fresh Open. Selective instance exclusion kept the saved document equal to its source and cleared on fresh Open.
