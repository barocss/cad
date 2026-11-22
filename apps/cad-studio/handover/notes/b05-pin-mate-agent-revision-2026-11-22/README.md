# D1685 — Freeze the B05 pin-and-holder mate revision for Agent evaluation

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/B05, rows 04, 09, 10, 12 and 16. Starting source `b6a92793f01bcded4ded426450dae731470e9291`.

## Frozen case

The `b05-pin-mate-revision` task starts from the actual Gap 0 state of a fresh D760 Studio replay. The versioned 1,928-byte fixture has SHA-256 `2b198792e9fb4850787aaf41ea2413d7b02fba4ee016059f18a66e2c605b2bb1`. The user prompt has SHA-256 `1411b9bbe60a0e2d25ec40cdf665cbbc4e5c1f102600df11ea6fb87a3c5d2a1d`. It asks to change the existing Distance mate from 0 to 3 mm, retain both part definitions and face references, and request approval.

The existing axis is `[32,16]` mm. The top of the holder is at Z8. The expected pin moves from Z8 to Z11 without rotation. The retained concentric references are `base/n2.side0` and `pin/n1.side0`. The Distance references are `base/n1.top` and `pin/n1.bottom`. The shared D760 oracle checks the native face geometry, stored pose, observed viewport bounds, and independent volumes `16384 - 128π` and `320π` mm³.

## Evidence

- **PASS, controlled local reference.** The L1 brief uses the public assembly read/edit actions and passes 5/5 hard checks. Its reference harness simulates the reviewer. The B01 reference still passes 5/5. Removing approval scores 2/5. Proposing a 2 mm gap scores 3/5. Both runs exit with a failure.
- **PASS, desktop Studio WebGPU.** Local MCP discovers the existing mate ID and exact references. A dry run preserves the seed bytes. The state still has gap 0 after the proposal, and L1 self-approval is refused. A user click in Studio approves the proposed gap 3. Fresh native Save/Open preserves both definitions, both mate identities and the same axis. Studio can edit the reopened mate back to zero and the pin returns to Z8. Five independent D760 bindings pass across eight captures. There are no page or console errors or source writes. The saved Gap 3 document hash is `f68e2da40a7adfac13642b2db7ad35f446beae6a5a4a8f92e289eaade6dbd2d7`. The measured holder volume is 15981.876140340513 mm³ and the pin volume is 1005.3096491487329 mm³.
- **FAIL, candidate placement visibility.** The proposal UI explicitly reports that placement changes are outside its preview. The viewport retains the accepted Z8 pose before approval and the card omits the volume field. Approval is available and the accepted model updates correctly. The next item is a visible After pose for this exact reviewed Distance mate, with Before and Hide retaining the accepted model. This does not qualify broad pose-preview support.
- **PASS, D760 desktop control.** Nine states and eight independent bindings pass after sharing the unchanged D760 inspector and oracle. The existing B05 v1 acceptance remains 7/7. Focused lint, standalone evaluation TypeScript, syntax and diff checks pass.
- **NOT_RUN.** Live natural-language provider, other backends and full local suites. First mechanical CAD stays 8/10. Overall CAD and natural-language provider success remain unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate, and a fresh evidence directory outside the repository.

```sh
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision,b05-pin-mate-revision
pnpm exec eslint apps/cad-studio/scripts/ai-eval/{briefs,pin-mate-revision}.ts apps/cad-studio/test/{pin-mate-agent-revision-browser,static-assembly-axial-mate-browser,static-assembly-axial-mate-oracles}.mjs
D1685_SOURCE_FROZEN=1 node apps/cad-studio/test/pin-mate-agent-revision-browser.mjs "$OUT/studio"
D760_SOURCE_FROZEN=1 node apps/cad-studio/test/static-assembly-axial-mate-browser.mjs "$OUT/legacy"
git diff --check
```
