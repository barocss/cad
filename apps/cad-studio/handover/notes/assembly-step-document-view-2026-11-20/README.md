# Apply the saved assembly step view when the document changes

P3, roadmap row 10, [issue #207](https://github.com/barocss/cad/issues/207). A step ID identifies a step within one assembly. Opening another file can reuse that ID with a different saved view.

On main at 062ecd71a, desktop Studio showed the new file and step name while its camera still used the previous document. Reopening the Steps panel applied the correct view. In the reproduced case the expected eye was (−50, 65, 150) mm and the observed eye was (135, 125, 130) mm. The largest coordinate error was 185 mm.

The step review now applies the saved camera when the document session or the displayed step ID changes. A rename or other ordinary edit in the same session preserves a manual camera. The assembly review hook owns the position, camera, explode scale and ordinary panel actions. App.tsx retains document commit and the existing selection and batch-edit checks. App.tsx decreased from 4,023 to 3,988 lines.

## Actual desktop Studio checks

Two separate assemblies used the same step ID, `place`. Opening the second one, undoing the Open, and redoing it restored each saved eye and target. Their maximum component error was below 0.001 mm. Switching to Top and renaming the same step retained the manual camera. The existing clear, recapture, save and fresh Open flow also passed.

The three-step fixture has a base and four named occurrences, including two blocks of the same definition. The browser authored separate Front, Iso and Right views. With the Post step exploded at ×1, three routes reached the same submitted WebGPU scene. Each showed Blocks 1 and 2 and the Post, highlighted only the Post and omitted the Cap. Going from Blocks to Cap with two Next clicks and jumping directly from Blocks to Cap both showed the same four occurrences, Cap highlight, transforms and saved camera. Selecting Block 1 on the Post step added the ordinary selection highlight. This distinguishes it from the active step highlight.

The desktop test reads the viewer mesh list after it submits a canvas frame. It checks surface and edge transform matrices, visibility, material state and camera, including an independent calculation of the ×1 translations in mm. These are (−30, −10, −9.5) for Block 1, (30, −10, −9.5) for Block 2, (0, −10, 0.5) for the Post and (0, −10, 17) for the Cap. The fixture has no mates. The native files saved before and after navigation had the same SHA-256, `04f1de72be0b92549f34d61a02246180de6be11d0f23802b87d73e7a941ab92a`. Existing Undo and Redo entries were still usable. This qualifies the stated top-level WebGPU case. Nested assemblies, connection highlighting, motion playback and WebGL2 are outside this check.

## Reproduce

Use Node 22.19.0 with the installed desktop Chrome and Playwright. Run heavy checks serially through the local gate. All browser outputs go outside the checkout.

```sh
pnpm --filter @barocss/cad-studio-app test assembly-steps assembly-step-member-selection assembly-step-takeout-selection step-explode-draft
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
STEP_CLEAR_VIEW_FROZEN=1 node test/step-clear-view-browser.mjs "$VIEW_OUT"
ASSEMBLY_STEPS_SOURCE_FROZEN=1 node test/assembly-steps-browser.mjs "$ROUTES_OUT"
ASSEMBLY_STEP_TRANSFER_FROZEN=1 node test/assembly-step-transfer-browser.mjs "$TRANSFER_OUT"
ASSEMBLY_STEP_BATCH_TRANSFER_FROZEN=1 node test/assembly-step-batch-transfer-browser.mjs "$BATCH_OUT"
ASSEMBLY_STEP_MEMBER_SELECTION_FROZEN=1 node test/assembly-step-member-selection-browser.mjs "$MEMBER_OUT"
ASSEMBLY_STEP_TAKEOUT_SELECTION_FROZEN=1 node test/assembly-step-takeout-selection-browser.mjs "$REMOVE_OUT"
STEP_SCALE_FROZEN=1 node test/step-explode-scale-browser.mjs "$SCALE_OUT"
```

The 34 focused Studio checks, scoped lint, Studio type check and build passed. All seven desktop flows listed above passed.
