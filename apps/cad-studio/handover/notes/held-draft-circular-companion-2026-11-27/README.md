# D2041: Recover held Draft beside a separate circular extrusion

P1, [#20](https://github.com/barocss/cad/issues/20). The held fixed-neutral Draft on one reversed X Split could already be repaired beside a separate rectangular Extrude. In the exact prior main `615a64ce1`, the same repaired output was not available beside an otherwise independent circular Extrude, and Studio showed no Replace face action.

Draft now also admits one trailing literal, unattached XY Circle and positive straight Extrude with a unique output producer. It still accepts only the held Draft's own current Split cap. A preview qualifies only if the unrelated cylinder's two oriented cap signatures and named exact cylindrical support agree, and the other Split half remains unchanged. Linked, positioned, consuming, compound, and multiple companions are not newly supported.

## Verification

- Real Chrome: prior has no Replace face, fixed rejects a click on the cylinder, then previews the correct cut cap. Cancel preserves the held document and history; Apply is explicit. Undo/Redo, Save and fresh Open pass. The separate rectangular extrusion is the unchanged desktop control.
- The untouched Split half and cylinder have identical native B-rep data in the native inspector before, after Apply, and after fresh Open (structural JSON equality). The cylinder's R6 × 8 volume is approximately 904.778684233861 mm³; the changed body agrees with the independent Draft volume formula.
- 12 focused tests and Studio type-check pass. The preview tests also reject a reply if the companion's radius or axis location changed. This is not general reference recovery.

[Prior](studio/00-prior-no-replace.png) · [Wrong body refused](studio/01-companion-refused.png) · [Preview](studio/02-preview.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm -C apps/cad-studio test held-draft-face-replacement
pnpm -C apps/cad-studio type-check
export D2037_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/held-draft-circle --circle
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/held-draft-box
# On exact prior product source 615a64ce1 with this driver copied in, use --circle --baseline.
```
