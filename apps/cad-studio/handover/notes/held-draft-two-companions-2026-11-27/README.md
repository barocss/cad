# D2044: Recover a held Draft in a document with a separate box and cylinder

P1, [#20](https://github.com/barocss/cad/issues/20). Exact prior main `fb6d25098` offered face replacement for the held fixed-neutral Draft beside either one independent box or one cylinder, but not when both independent solids were present together.

Studio now admits up to two trailing literal unattached XY Rectangle/Circle and positive straight Extrude pairs. Each must resolve its own unique output producer and its own unchanged face signatures before Apply. The held Draft still accepts only its own reversed-X Split cap; the other Split half also has to agree with the original. Preview body order is not used to identify a producer. Linked, compound, or three-or-more companions remain unsupported.

## Verification

- Actual Chrome comparison: previous main lacks Replace face for the box-plus-cylinder document. Fixed rejects both companion picks, then previews the Draft cap. Cancel keeps the document and history; Apply is explicit. Undo, Redo, Save and fresh Open pass. The older cylinder-only workflow passes again as the control.
- The untouched Split half, box and cylinder have identical exact native B-rep structures before Apply, after Apply and after fresh Open. The independently computed Draft result matches 8735.509528937302 mm³. The cylinder is R5×7 with 175π mm³ and the box is 1152 mm³.
- 13 focused tests and pinned TypeScript 5.9.2 pass. Synthetic preview tests reject a replaced/duplicate producer or a change to either companion height, but accept harmless reply reordering.

[Before](studio/01-prior.png) · [Box refused](studio/02-box-refused.png) · [Cylinder refused](studio/03-cylinder-refused.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm -C apps/cad-studio test held-draft-face-replacement
export D2037_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/mixed-draft --mixed
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/draft-circle --circle
# On exact prior main fb6d25098 with this driver copied, add --baseline to the mixed run.
```
