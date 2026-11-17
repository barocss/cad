# Author revision ECO references in Studio

Baseline: `06589f995` (Sketch translation included).

The native revision record already supports optional `eco` identifiers (1–20 single-line characters), preserved by the reader and displayed in the existing revision table. Studio previously had neither an authoring input nor ECO readback in its revision list. This adds the missing bounded consumer UI without changing schema, admission or export layout.

- Optional Revision ECO input, max20, trimmed when explicitly recording the current revision. Blank is omitted.
- Existing ECO records are shown in the revision list. Text flexes/wraps so Remove remains inside the narrow settings panel.
- ECO and description drafts clear after recording, avoiding accidental reuse for the next revision. Date/by behavior is unchanged.
- Error explanation now mentions the already-supported ECO field and limit.
- This is a reference identifier, not approval, release or an external change-order workflow.

## Verification

- New Studio SSR/native-contract tests2/2: imported ECO readback/input limit; exact native validation/read/table; legacy omission; invalid empty, overlong, multiline and tab identifiers refused.
- Existing Model drawing-metadata tests13/13: metadata/file/table/SVG/DXF/chat/sparse-array regressions. This is not new actual-browser DXF qualification.
- Actual Chrome first and final runs PASS. Imported A/EC-100, explicit B/EC-204 with trim and draft-only document equality; maxlength20; missing date/description disable Record; Record is also disabled after successful recording; C with blank ECO omits the property. Existing records/nodes preserved, Undo/Redo, actual SVG download with ECO header/EC-100/EC-204, native Save/fresh Open.
- First screenshot inspection found the pre-existing revision text shrink-0 overflow. Only that row text now shrinks/wraps; the final run repeats all checks and asserts Remove is inside the row. Final screenshots manually reviewed.
- Studio TypeScript, targeted ESLint and diff checks PASS.

Run with Node22.19.0 at repository root:

```sh
node apps/cad-studio/scripts/test.mjs drawing-revision-eco
node packages/barocss-cad-model/scripts/test.mjs drawing-metadata
PW_DIR=/Users/user/.cache/barocss-playwright \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
DRAWING_REVISION_ECO_FROZEN=1 \
node apps/cad-studio/test/drawing-revision-eco-browser.mjs /private/tmp/cad-eco-new
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
```

Limits: single synthetic part drawing, A3, three short records. General long-table fit, PDF/DXF browser flows, external ECO integration and manufacturing certification NOT_RUN. Existing HOLD boundaries and #180 remain open.
