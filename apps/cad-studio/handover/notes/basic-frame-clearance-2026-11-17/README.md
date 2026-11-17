# #613 — aligned basic linear frame clearance

## Product boundary

The defect was the aligned basic linear label's undecorated text fitting the ruler span while the later basic frame padding still crossed its own ruler. `clearOfLine` now accounts for the exact basic-box border and pen before its fit/clearance decision, moving text along the existing text-up direction; the subsequently generated frame follows it. Own ruler/arrow geometry, references and placement are unchanged. Nonbasic, circular and ASME placement paths, diagnostics and label search are not broadened.

The Model owner reported the focused 18-case clearance checks and final Model type/lint checks passing. The integration owner retains the complete adjacent-suite/build accounting, including unrelated pre-existing failures; this actual note does not turn those suites into an all-green claim.

## Actual acceptance

First actual run `cad-basic-frame-613-01` passed on 2026-11-17. The dedicated driver is `test/basic-frame-clearance-browser.mjs`. This is new evidence, not a relabeling of the earlier partial result. The existing `tolerance-label-partial-browser.mjs` and its evidence are unchanged.

The existing synthetic 100 × 40 × 10 part with four Ø6.6 holes uses pinned **+X, A4, scale 0.5**. Public **Accept all suggestions** produces the four boxed `12` dimensions d1–d4 and counted boxed `3× 20` d5. Actual whole-sheet diagnostics were **empty**, independently observed rather than inferred from the own-frame checks.

- d1–d4 original dimension fields, including references, place and count, match the pre-acceptance fixture exactly after excluding only the intended `tol`/`basic` decoration fields. Model nodes remain unchanged.
- Accepted document and resolved dimension quantities match expected tolerance acceptance. Compared with the same settings with basic decoration removed, d1–d4 own line/arrow marks remain exact. This is not a claim of historical renderer pixel identity.
- Undo restores the initial document; Redo restores the accepted document and sheet. Native Save and fresh Open restore the exact accepted document and sheet; the independent export checks pass again after reopening.

## Independent SVG / DXF oracle

Exports are original application-produced SVG and DXF Blobs captured at the download-anchor boundary. Those export downloads were suppressed. The one recorded `.bcad` download is the intentional public native Save operation.

A standalone Python oracle imports no product geometry/collision helpers. For each d1–d5 it verifies actual SVG text/frame and own line/arrow geometry, including polygon containment as well as intersections. Frame and line stroke widths are included. Matching DXF TEXT, closed LWPOLYLINE frames, LINE and triangular SOLID entities are checked with the sheet Y-coordinate flip and Unicode decoding. This is a narrow entity/coordinate parser, not a general DXF reader or a glyph rasterizer.

**Minimum observed own-ink clearance from serialized SVG:**

| Dimensions | Minimum gap (mm) |
| --- | ---: |
| d1–d4, each | 0.003962658470840097 |
| d5 | 1.2000373415291676 |

The d1–d4 value is small but positive after stroke widths, and exceeds the oracle's two-coordinate serialization allowance (`2 × 0.000050001 mm`). **Do not describe all labels as having 1.2 mm clearance.** These minima include arrow geometry, not just the ruler line. Accepted and reopened exports yield the same values.

## Evidence and limits

- [Accepted drawing](02-basic-frames-clear.png)
- [Fresh-open drawing](05-fresh-open-drawing.png)
- [Privacy-minimized receipt](receipt.json), including original receipt hash and copied artifact hashes
- [Accepted independent oracle](accepted-clearance-oracle.json)
- [Fresh-open independent oracle](fresh-clearance-oracle.json)

The original runner receipt retains `visualReview: ROOT_MUST_VIEW_SCREENSHOTS`, a historical handoff marker, not an unresolved current review. The shared receipt is explicitly a privacy-minimized excerpt with the original hash and a separate completed visual-review statement.

Both actual PNGs were inspected directly by the executing agent and parent: synthetic CAD content, no personal data. Runtime errors and console errors were empty; browser contexts, browser and server were closed. The source capsule remained unchanged during execution. Driver syntax and targeted lint passed before execution.

No ASME/PDF claim, manufacturing approval, general typography guarantee, or resolution of unrelated baseline failures is made. Existing HOLD scopes are unchanged. The earlier partial proof remains historical; this run is limited to the stated pinned fixture and public lifecycle/export checks. Model/unit/type/build evidence is tracked separately by the integration owner.

## Root cause and integrated checks

The aligned linear primitive checked undecorated text against the free ruler interval before the basic frame was added. For the short 12 mm dimensions at scale 0.5, the text fit but its later frame crossed its own ruler. Moving the complete annotation cannot repair that internal collision. The primitive now includes the exact basicBox geometry and pen width in its clearance bounds. Authored references/place, ruler/arrows, ASME's separate unidirectional path and circular-label policy are unchanged. Existing bounded placement and real-overlap diagnostics remain enabled.

- New horizontal/vertical/aligned × reversed direction × scale 0.5/1/2 regressions: original primitive 18 failures; corrected primitive 18 passes.
- Direct-impact Model selection: **91 passed / 92 total**. The circle DXF golden check fails identically using the original HEAD primitive (control: 60 passed / 61 total); geometry, circle marks and numeric payload checks pass. Existing golden files were not changed, and this is not an all-green suite claim.
- Final Model type check and targeted lint: pass. Two test-only type corrections after the direct-impact run do not change runtime arithmetic.
- Studio type check, driver syntax/targeted lint and production build: pass (build 3.87 s).
- Original protected checkout's eight WIP entries were rechecked unchanged before integration. No HOLD implementation was included.
