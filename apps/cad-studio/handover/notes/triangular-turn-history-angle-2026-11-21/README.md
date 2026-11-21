# D1547 — Edit the signed angle of a saved triangular Smooth Turn

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 8b2bfaf394e80331bb1438bddea7fc7da5324b0a.

An intact terminal triangular Smooth Turn exposes its existing signed Turn angle in History. Rotate the owned straight-triangle section copies about their original centroid. The original sketch, first section, section IDs, frame, height, Loft node and fixed station count supply the edit. Each original station interval admits at most 30° of signed rotation. Only rectangular turns expose Turn width. Nonterminal triangular turns retain Total height.

- **PASS, actual Studio on desktop WebGPU.** Create and stretch the 16-station −450° triangle to 50 mm. Verify that +451° disables Apply and preserves the document. Apply +450°, Undo and Redo the signed edit, Save, and fresh Open. The editor reads +450° after reopening. The accepted body remains one strict native solid with 5 faces, 9 edges, 6 vertices and the same persistent IDs. The camera shows the opposite winding on the same source profile. All 16 stored stations and signed rail derivatives agree with direct rotation at their expected heights. The viewport uses 690 triangles.
- **PASS, native files and Agent entry.** The before and after volumes are 1050.061278406116 and 1050.0612784061154 mm³, respectively, at centroid [18, −6, 46] mm. The edited and reopened native digest is e638f147fd65396b0d75a1e240bb29f18702290a1f7dd89641f0a310f31ff98c. The local features tool rejects missing and stale revision pins and accepts the current revision. This test calls the local tool without a live Agent service.
- **PASS, affected checks.** Sixteen Model and 29 Studio tests, scoped ESLint, Model types, Studio production build and types, browser syntax and Git diff. The actual Studio receipt has no runtime errors, console errors or frozen-source edits.
- **FAIL, corrected test type.** The initial tool test evaluator returned a synchronous value. It now satisfies the asynchronous evaluator contract and passes the Model type check.
- **NOT_RUN.** A full MCP visual proposal and approval on this triangular profile, triangular STEP exchange, WebGL2 for this edit, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy commands and keep raw browser captures outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle ruled-turn-command
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-triangular-turn-browser.mjs
git diff --check
TRIANGULAR_TURN_FROZEN=1 node apps/cad-studio/test/smooth-triangular-turn-browser.mjs "$EVIDENCE"
```
