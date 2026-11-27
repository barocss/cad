# D2037: Restore a held Draft beside one independent extrusion

P1, [#20](https://github.com/barocss/cad/issues/20). A Draft on the negative half of a reversed X Split already had a manual, individually qualified cap replacement. The previous admission rejected the same document once a separate rectangular extrusion was added after the Draft, even though it could not affect either Split half.

The exact original four-node Draft remains required. This adds only a trailing plain rectangular sketch plus its own literal positive Extrude, with a unique output and producer reference. The prefix evaluation still has exactly the two Split halves. The preview and commit retain the original third output; the untouched Split half and the companion must retain all six planar face signatures. The replacement updates only the Draft node and never copies or removes the companion.

## Evidence

- Exact-prior and fixed desktop Chrome 158 on a synthetic document. The companion pick was refused before any change. The user-selected Split cap `n2.cut.side3` passed checked preview; Cancel preserved the original document and history. Explicit Apply plus Undo/Redo and native Save/fresh Open all passed. The original two-body flow also passed.
- Strict native solids: the untouched Split half and companion, 9,000 and 1,152 mm³, were native B-rep identical after apply and reopen. The repaired Draft had volume 8,735.509528937302 mm³, matching the independent prism-minus-wedge formula at 10°.
- 20 targeted Studio tests and the Studio type check passed. The suite covers stale source/preview, wrong pick and an attached companion refusal as well as changed or missing output rejection.

[Prior button absent](studio/00-prior-no-replace.png) · [Wrong body refused](studio/01-companion-refused.png) · [Checked preview](studio/02-preview.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm -C apps/cad-studio test held-draft-face-replacement held-shell candidate-preview reference-decisions
export D2037_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/held-draft-companion
node apps/cad-studio/test/held-draft-companion-browser.mjs /tmp/held-draft-two-body --single
# On the previous product source with only the driver copied, use --baseline.
```

Other Draft families, more companions, arbitrary replacement faces and general reference repair remain outside the validated scope. #20 stays open.
