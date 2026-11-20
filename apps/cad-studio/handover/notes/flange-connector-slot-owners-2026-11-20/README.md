# #27 connector-slot bend History links

Exact baseline: `da40a3087a73a345db73866bd5f873aa5b9b67f1`. Exact product fix: `59c2a9260aa9f02c4b31177f6af3f2f13ac1136d`.

Open the synthetic D121-style PCB enclosure in Studio Chrome/WebGPU. The fixture has a 1.5 mm sheet, four corner reliefs, four 90° flanges, four Ø3.2 mm through holes and a 20 × 8 mm rectangular slot cut through the front flange after those holes. Compare the four-hole control with the terminal slot cut.

- Baseline: the flat pattern showed four bends and the slot but offered no bend-owner History links.
- Fixed: flat-pattern History links open each original bend owner `n6`, `n7`, `n8`, `n9`; the sheet-rule links open shared source `n1`. Navigation did not change the document or native shape.
- The exact slot removes 240 mm³ of solid material and 160 mm² from the flat. The original four bores and four bend owners remain intact. Strict B-rep checks, four-hole control and prior one-Hole/four-Flange/two-Flange browser regressions passed.
- Focused checks: 40/40 tests; scoped lint, Studio type checking and production build passed.

## Original screenshots

Both are 1440 × 1000, with no edits.

| Capture | SHA-256 |
| --- | --- |
| [Before](02-front-slot-no-links.png) | `3574b35b7fd83fadc58daf971b1b06155c61a2dbf197c4ac45786e24f471dfe1` |
| [After](02-front-slot-history-links.png) | `dbe030c6c8730f6c32a7ec62bb9cc76fa47ccc1f46ad5fef3c2ef844065a3387` |

This qualifies History navigation on the exact supported rectangle → plain Extrude → terminal Difference shape and synthetic fixture. It does not qualify editing an individual bend radius, edit/Undo/Save/export, arbitrary Boolean tails or the original checklist row 1427. No manufacturing capability is claimed.
