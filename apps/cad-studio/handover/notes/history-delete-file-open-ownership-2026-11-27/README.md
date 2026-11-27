# D2048: Keep a late Delete from cancelling a newer File Open

P1, [#5](https://github.com/barocss/cad/issues/5). Prior public base: `2eca2643c31ecdd9429bfbe64412f2e44d790db7`. Desktop Studio could remove a feature or an entire body from the previous document if Delete's evaluation finished while a subsequently chosen native file was still reading. The deletion changed the document and silently revoked the newer Open. This is distinct from the History reorder fixed in D2047.

All three verified feature-delete routes now check the already captured History ownership immediately after evaluation, before committing or showing a refusal: History Delete, confirmed Delete with dependents, and keyboard deletion of a selected body. Existing dependency checks, explicit destructive confirmation, normal undoable deletion, and format/kernel behavior are unchanged. Separate pieces is not included.

## Desktop and native checks

Real Chrome/WebGPU uses the unchanged successful Worker evaluation and actual chosen file bytes, delivered out of order. Prior source reproduced all three old-document losses. Fixed source opened the newly chosen 12 mm drilled part after all three routes. First Undo restored the original 8 mm part including its Ø4 Hole and the independent cylinder; Redo and native Save/fresh Open preserved the new document. Each of the three ordinary deletions still applies and undoes without a competing Open.

The strict native and browser mass/centroid checks agree with independent box-minus-bore and cylinder formulas. The old plate after first Undo is 4699.469035085 mm³ (not the erroneous undrilled 4800 mm³); the new plate is 7049.203552628 mm³. The independent cylinder when retained is 471.238898038 mm³.

The D2047 reorder/Open control, 13 Model transaction/rebuild/output tests and Studio with CI-pinned TypeScript 5.9.2 pass. The broader #5 contract remains open.

[Before: cascade Delete cancelled the new file and removed the old plate](studio/before.png) · [After: the chosen file opens with both bodies](studio/after.png)

```sh
export D808_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/delete-open-fix --delete-open-race
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/delete-open-reorder-control --open-race
# On the previous SHA with this updated driver copied in:
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/delete-open-prior --prior-delete-open-race
pnpm -C packages/barocss-cad-model test transactions o10-rebuild chat-outputs
```
