# D1388 — explicit Direct Thicken thickness draft

Completes #166 at the tested desktop scope. The Direct Thickness field keeps its raw draft. Blank or nonfinite input shows `Enter a finite thickness.` beside the field, links the message to the field and disabled start button, and cannot silently start with the old 2 mm value. Finite values and the selected side continue to the existing editor unchanged. Native sign, geometry and feature admission remain unchanged.

## Sources and verification

- `src/ui/DirectPanel.tsx`: owner/revision-scoped thickness draft using the existing surface draft helper; guarded start callback.
- `test/direct-surface-domain.test.ts`: blank/space/nonfinite rejection, exact finite values, side forwarding, ownership resets and immutable document. Adjacent surface domain/pole regressions retained.
- `test/direct-thicken-draft-browser.mjs`: actual desktop preview/Apply and lifecycle checks with independent native volume and witness digest.

Mac Node 22.19.0: 13/13 focused tests, targeted ESLint, Studio TypeScript and production build PASS. First actual Chrome run PASS at 1024×800 and 1440×900. Blank default thickness then Tab stays empty and invalid, has the linked message and disabled start, and creates no editor or document change. Entering 3 opens the existing editor with visible 3 mm and total preview volume 4020 mm³. Apply creates a native strictly valid 3600 mm³ plate (40×30×3) while retaining the independent 420 mm³ body and its digest. Original direct source remains unchanged. Undo, Redo, native Save and fresh Open match independent native proofs. Four blank/preview screenshots reviewed; local message, start state and valid thickness are readable at both widths. No browser errors or source changes.

Receipt: `d1388-first/receipt.json`, SHA256 `df376b6aebbce3b3abf65002d4adfa5d572aec4a6c4fc3c2add398d7cc760709`. Evidence retained locally outside the repository.

The browser fixture uses an authored D341-equivalent planar 40×30 panel and a separate 420 mm³ witness at Z0, not the original fixture witness at Z1. Other surfaces and assistive technology were not run. No new Thicken support or held capability is qualified. Existing unrelated App lint and aggregate documentation inventory drift remain separate; this is not a full-suite pass.
