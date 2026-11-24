# D1935 — Propose detaching Extrude to face at its current distance

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#222](https://github.com/barocss/cad/issues/222). Base `0452689bacd4e52ba1f109462cf21a0fe7529fa9`. Feature change.

The local Agent can propose `features.edit` with `values: { detachToDistance: true }`, a numeric feature index and the current `expectedRevision`. The command uses the same native distance and detach helpers as Studio. It preserves the feature ID and sketch. Normal recompute and downstream reference checks apply before a proposal can succeed. It refuses mixed values, full replacement and other feature kinds. Studio approval remains mandatory.

- **FAIL, previous local MCP.** The pinned command refused the supported Studio operation as an unknown value. The project bytes remained identical and the linked extrusion opened in Studio.
- **PASS, local MCP and desktop Studio.** Tool discovery shows the action. The proposal rejects missing and stale pins, another feature kind, conflicting values, direct level-1 edit and Agent approval. The accepted request adds only proposal metadata. Studio Preview leaves the document equal to the pending state. Accept, Undo, Redo, Save and fresh Open retain the intended feature and sketch. Editing the former target from 8 to 6 mm after Open leaves the detached extrusion in place. Four current screens and one baseline screen passed visual review.
- **PASS, independent measurements.** The circle has radius 2 mm and the selected cap is 12 mm along the sketch normal from z = 20 mm. The extrusion occupies z = 8–20 mm with centroid (5, 4, 14) mm and volume 48π = 150.79644737231013 mm³. Strict B-rep, named faces, vertex coordinates and mass are equal before detach, after acceptance, after fresh Open and after changing the former target. Studio Worker volumes match within 1e−8 mm³. The focused descendant test also retains the subsequent volume and sketch/feature identity.
- **PASS, affected checks.** 46 Model and two Studio MCP tests, Model and Studio types, scoped ESLint, generated Agent tools check, Studio production build and diff check. The two focused mutations fail when they bypass the required revision or use a guessed 15 mm distance. Existing production build warnings remain.
- **NOT_RUN.** Other profile and target classes, placed targets, paid or remote Agent, full local suites and mobile. #222 stays open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1935_SOURCE_FROZEN=1 node apps/cad-studio/test/reviewed-extrude-detach-browser.mjs "$OUT/studio" "$FIXTURE"
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude tool-contract
node apps/cad-studio/scripts/test.mjs tool-contract-mcp
pnpm --filter @barocss/cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-studio build
git diff --check
```

The fixture is the Studio-saved D1932 downward-circle project after the target height edit. The baseline uses the same browser flow and fixture with `--baseline` against the previous action handler. Evidence files stay outside Git.
