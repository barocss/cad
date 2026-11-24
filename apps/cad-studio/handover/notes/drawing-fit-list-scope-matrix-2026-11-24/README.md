# D1883 — Distinguish unavailable Fit lists from an empty supported list

P2 [row 11](../../roadmap-rows/11.md) and [row 13](../../roadmap-rows/13.md), [#269](https://github.com/barocss/cad/issues/269). Base `d237e858b831051b7659f8b9faf0f356c4abaf3b`.

The existing Fit dimensions table has distinct empty and unavailable states. This slice checks those states in the actual desktop Drawing workspace and both original export byte streams. It also keeps an ordinary handwritten table in each document as a witness that the Fit diagnostic does not discard other table data. Product code is unchanged.

- **PASS, actual desktop, SVG and DXF.** Ten states and nine pairs of SVG/DXF pass. The seven unavailable cases include a hidden Right view, lost circular edge, classed radius, multiple sheets, assembly, instance part and base scope with placed instances. Zero page, console and source errors. The empty supported list prints its explicit empty-state note. Unavailable cases print a reason and no current or stale Fit table rows. A known legitimate callout on an unchanged diameter survives loss of a separate reference. The ordinary table appears in both outputs. XML text and DXF TEXT codes are read independently from the original browser Blobs.
- **PASS, affected checks.** 16 scoped Model tests, 3 Studio tests and lint. Existing Model coverage includes section/detail families, duplicate IDs, ambiguous source faces and signed estimate data.
- **FAIL, extended adjacent Model suite.** 25 passed and the existing frozen conventional-table DXF comparison failed. The test and its product inputs are unchanged. The same failure was recorded on the original Fit list implementation in #269. The selected actual exports above pass their independent readback.
- **FAIL, earlier harness attempts.** Front and Top are mandatory views, so the first hidden-view fixture did not survive normalization. The replacement uses a native right-view bore, verifies its visible row, then omits the optional Right view. The first right-view source attempted to use Auto-dimension and found no eligible right-view dimension. The final fixture uses the actual right-view circular edge. The export oracle now distinguishes missing Fit table cells from a valid diameter callout. The multi-sheet run verified the same document data but the helper waited for identical JSON property order; the final check compares the document before and after export by contents.
- **NOT_RUN.** Whole local suites, local production build for this test-only change, independent external viewer, actual section/detail exports and mobile. The parent issue remains open while the paired adjacent nominal ranges and narrow-zone dual-unit exports are qualified. First mechanical CAD stays 8/10.

## Reproduce the affected checks

Use Node 22.19.0, the existing local Chrome and Playwright, and the existing Python standard library for the two independent export readers. Freeze the worktree during Studio and run heavy jobs serially.

```sh
pnpm --dir packages/barocss-cad-model test drawing-fit-list drawing-body-scope
pnpm --dir apps/cad-studio test fit-list-settings
D1883_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-fit-list-browser.mjs "$OUT/studio" --unsupported
```
