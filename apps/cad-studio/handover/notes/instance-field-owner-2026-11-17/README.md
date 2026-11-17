# Instance scalar draft ownership

Baseline: `a7e543cdbb742a1eb30804afcccdd7f061ae1a9c`.

An invalid empty scalar draft in Block 1 survived selection of Block 2 when both saved values were equal. Actual Chrome baseline failed at Y: empty input versus saved 10 mm, while the accepted document was unchanged. This was misleading input state, not a demonstrated wrong model commit.

InstancePanel Field now resets its draft when the exact instance object changes, not only when the scalar changes. InstanceInspector obtains that object directly from the accepted document. No document, transform, schema or numeric acceptance policy changes.

## Verification

- New actual Chrome driver `test/instance-field-owner-browser.mjs`: PASS. Empty Y/Z position and XYZ rotation drafts cannot cross owners; returning to the first instance shows its saved value. Valid blur on selection change still commits 23 mm to the original instance only; Enter commits 31 mm to the second. Other instances and base nodes remain exact. Undo/Redo and native Save/fresh Open pass.
- Existing `test/instance-field-cancel-browser.mjs`: PASS, including nine Escape cancel cases, Enter/blur commit, Undo/Redo, Save/fresh Open.
- Studio TypeScript noEmit, ESLint for changed product/driver and git diff --check: PASS.
- Before/selected/reopened screenshots manually inspected. Receipt excerpts retained beside this note.

Run from repository root with Node 22.19.0:

```sh
PW_DIR=/Users/user/.cache/barocss-playwright \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
INSTANCE_FIELD_OWNER_FROZEN=1 \
node apps/cad-studio/test/instance-field-owner-browser.mjs /private/tmp/cad-instance-owner-new
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
node node_modules/eslint/bin/eslint.js apps/cad-studio/src/ui/InstancePanel.tsx apps/cad-studio/test/instance-field-owner-browser.mjs
```

Limits: top-level instance scalar editing only. Nested assemblies, mate-driven instances, pattern occurrences and neutral exports NOT_RUN. No assembly-wide completion claim; #178 remains open.
