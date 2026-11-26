# D2027 — Follow-on flange after sheet Mirror and Duplicate

[Issue #198](https://github.com/barocss/cad/issues/198) · Desktop qualification and regression tests, no product behavior changed.

| Actual desktop WebGPU path | Verified result |
| --- | --- |
| Asymmetric L bracket → single YZ reflected body → 20 mm Flange | A named edge picked in the viewport adds a valid second bend. The asymmetric hole stations and both bend directions agree with the native flat. [1.5 mm flat](01-reflected-flange-flat.png) |
| Edit the reflected body's source thickness 1.5→2.0 mm | The refolded output remains a single sheet. At K 0.44, the flat changes from 30 × 84.786 to 30 × 83.477 mm. [2 mm flat](02-reflected-flange-thickness2-flat.png) |
| Disjoint +60 mm Duplicate → add a 20 mm flange to the copy only | The original stays at one bend and 30 × 67.393 mm; the copy has two bends and 30 × 84.786 mm. [Copy flat](04-copy-flange-copy-flat.png) |

Both browser flows pass Undo/Redo and browser-project Save/reload/Open with an exact native-document comparison. The model tests additionally bind the actual `sheet-contour` node to a supplied bend table, check changed row provenance and flat size on the reflected and duplicate outputs, and assert that a missing row refuses. The kernel tests check the table/flat contract including double reflection and retain the existing explicit refusal for unsupported combined/ambiguous output, Scale, and Linear Pattern. The two pre-existing Translate/Rotate assertions had gone stale: the source retains its authored-flange editing link, while the carried bend's physical report and table provenance (not the old editing link) are preserved. Tests now assert that distinction without changing the kernel.

The broader model runner filtered by `sheet` also selects drawing-sheet tests. It reports the held, unrelated single-page PDF golden mismatch; it is not a green full-suite claim.

This does not qualify general body Pattern, arbitrary mirror planes, overlapping copies, external CAM, or manufacturability. The broader #198 stays open.

```sh
pnpm --filter @barocss/cad-model test sheet-transform-flange sheet-acceptance
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/r12-{1,2,3,4}.test.mjs
D2027_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright-project CHROME=/path/to/chrome \
  node apps/cad-studio/test/sheet-mirror-flange-browser.mjs "$(mktemp -d)"
```
