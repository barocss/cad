# D1940 — Diagnose a held Chamfer before a Through Hole

P1 [row 8](../../roadmap-rows/08.md), [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `0938ec8bb48084ac58e85e7c36ca30cdcbda39e5`. Feature change.

The local Agent's detailed `query.summary` identifies a held single-edge constant Chamfer before an independent top Through Hole. It reports the current document revision, both feature IDs, the current body, the original source body and eligible original top edges. It reports signature matches as tentative. The same edge checks serve Studio History. Studio still requires an explicit pick and Apply. The CAD document format and the terminal three-edge Fillet result stay compatible.

- **PASS, previous local host control.** At revision `ab4fcd396e754a87`, detailed summary saw both features on the same fixture without reporting recovery choices.
- **PASS, local MCP and actual desktop Studio.** On revision `ab4fcd396e754a87`, the detailed output reports Chamfer `n2`, Through Hole `n3`, visible body `b3`, original body `b1`, the retired edge and four complete original edges with millimetre endpoints. The selected edge runs from (−20, −20, 10) to (60, −20, 10). The concise result omits the recovery list. The read leaves the saved bytes and current document and History unchanged. Studio refuses the Hole rim, previews the original edge, Cancel retains the held state, and explicit Apply restores Chamfer. Undo, Redo, native Save and fresh Open preserve the intended state. The same MCP inspection at revision `975af0a5c12cb1cd` retires the diagnosis. An actual desktop three-slot held Fillet and MCP control passes as well.
- **PASS, independent native results.** On 80 × 40 × 10 mm stock, a through radius 2 mm subtracts 40π mm³. The confirmed 3 mm chamfer subtracts a further 360 mm³. Studio and native mass match 31874.33629385641 and 31514.33629385641 mm³ within 1e−7 mm³. The same Hole node, original center, two inward cylinder spans, and valid single genus-1 body survive repair and reopen. Strict topology changes from 8 to 9 faces.
- **PASS, affected checks.** Two new Model cases cover exact picks, current/detailed scope, duplicate or stale ownership, adjacent-edge clearance, unsupported blind Hole, late-page filtering and retirement of the diagnosis when no reference is held. Eighteen Model tool/recovery checks pass. Twenty-four Studio tests, Model and Studio types, scoped ESLint and the Studio production build pass.
- **FAIL, existing.** The v2 per-turn tool and prompt budget is 25160 against 25000 characters. The exact same failure and 17539 + 7621 split reproduce with the baseline source. No budget test was loosened. An initial browser oracle compared rounded MCP presentation volume with native precision. The accepted run separately checks the three-decimal summary and native mass.
- **NOT_RUN.** Paid or general-language agents, arbitrary downstream features, finished-edge editing and new schemas, full local suites and mobile. The broader #20 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1902_SOURCE_FROZEN=1 node apps/cad-studio/test/held-chamfer-through-hole-browser.mjs "$OUT/studio" --mcp
D1871_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/control" --fillet --mcp
node packages/barocss-cad-model/scripts/test.mjs held-finish-recovery.test toolset.test tool-contract.test
node apps/cad-studio/scripts/test.mjs held-finish-replacement mcp
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The two Studio runs use installed desktop Chrome. The captured images, wire transcript and frozen-source receipts stay outside Git.
