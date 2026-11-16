# Exact Offset face labels (#129)

Both native Offset face and legacy authored Offset group labels now use the stored number string, not the shared two-decimal `fmt`. This preserves the signed value for History accessible names/tooltips and Browser feature names. Reference-plane labels, editor values, serialization and geometry are unchanged.

## Validation

- Unit baseline reproduced `-35.918` becoming `-35.92`.
- Focused model tests 2/2 PASS: exact native/legacy labels including small positive/negative values, and drafted-wall edit/collapse recovery.
- Real Chrome flow PASS at 1440x900 and 1024x900. A 40x30x10 mm, 10-degree drafted rectangle is offset at its inclined +X wall.
- History aria-label/title and Browser feature text distinguish -35.918 and -35.916 mm. Edit initially retains -35.918; -35.92 is refused without document changes. -35.916 applies; Undo/Redo restores each exact value and label.
- Save and fresh Open retain -35.918 and exact labels. Strict B-rep, independent plane/vertex/volume oracle, topology identity checks and exact reopened geometry digest pass. Invalid collapsed file leaves the current document unchanged.
- Changed-file ESLint and Studio build/typecheck PASS.

Reproduce with `D1261_SOURCE_FROZEN=1`, installed Chrome/Playwright, and `node apps/cad-studio/test/offset-drafted-wall-browser.mjs OUTPUT WIDTH`.

Limits: desktop Chrome only; legacy grouping is covered at label-unit level, not a new legacy browser flow. Other feature formatting and broader geometric capability are unchanged. Full repository suite and assistive technologies not run.
