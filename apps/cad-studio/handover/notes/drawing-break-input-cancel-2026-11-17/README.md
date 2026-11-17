# Drawing break coordinate cancellation

Baseline `f154bb847`: a pending Break 1 from value 16 → 18 survives Escape; a later Tab commits 18. This is an actual document mutation, not merely stale display. The baseline driver intentionally fails and records the subsequent blur result (`before.png`).

Fix: BreaksList handles Escape locally, discards its coordinate draft and prevents the event reaching workspace shortcuts. Enter/blur validation is unchanged. No geometry, native schema or saved reference changes.

## Verification

- Actual Chrome baseline FAIL, fixed run PASS: all four ends of two X-axis breaks plus two empty-input cancellations (6 total). Escape restores accepted numbers and focus; subsequent Tab leaves the entire document unchanged.
- Enter sets first from to 18; Undo/Redo restores exact accepted documents. Reversed (40→32) and overlapping (18→45 with 44→52) candidates are rejected. Explicit blur sets second to to 54. Source nodes unchanged.
- Native Save and fresh-context Open preserve both intervals and display 18/54 (`reopened.png`).
- Actual front/top placement width is 52 mm, by independent formula 64 − (32−18) − (54−44) + 2×6. Actual downloaded SVG parsed with Python XML: native visible boundary-line endpoints range X173…225 in both views, also 52 mm. SVG is retained here.
- Existing `drawing-breaks` model regression: 8/8 PASS, including geometry, saved validation, dimension length, sections, and ezdxf readback. This is controlled model DXF coverage, not a Studio DXF download claim.
- Studio TypeScript, focused ESLint and diff whitespace checks PASS.
- Source hashes equal before/after/cleanup during the browser run.

Reproduce from repository root with Node22:

```
node packages/barocss-cad-model/scripts/test.mjs drawing-breaks
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
node node_modules/eslint/bin/eslint.js apps/cad-studio/src/ui/drawing/BreaksList.tsx
DRAWING_BREAK_INPUT_CANCEL_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/drawing-break-input-cancel-browser.mjs <fresh output>
```

Screen review: before shows the unintentionally committed 18; cancelled shows accepted 16; reopened shows explicit 18 and 54 with both break bands. Synthetic 64×32×8 plate only. PDF/Studio DXF downloads, other axes, general dimension certification and manufacturing acceptance NOT_RUN. #180 remains open; existing HOLDs unchanged.
