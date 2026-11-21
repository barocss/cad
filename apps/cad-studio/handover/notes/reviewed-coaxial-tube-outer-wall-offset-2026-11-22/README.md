# D1606 — Propose a reviewed outside wall Offset on a coaxial tube

P5, row 31, [#322](https://github.com/barocss/cad/issues/322) and [#629](https://github.com/barocss/cad/issues/629). Base `1804376bec628e95b57035fecbe0948f7a793c99`.

The local Agent can discover and propose a signed `values.offsetDistance` edit for the terminal outer wall Offset of a supported upright coaxial tube. It checks the current native output for the named, complete outer cylinder and the verified smaller bore. The caller must use the current `expectedRevision` and only this value. The existing History command and native evaluator build the candidate. Autonomy 1 leaves it for user approval in Studio.

- **PASS, local MCP and desktop Studio WebGPU.** Review the −1 mm and +2 mm saved states. Refuse absent and stale revisions, mixed values, zero and bore contact at −5 mm. Every refused attempt retains the input bytes. Direct mutation and tool approval are refused. The pending edit and its preview retain the +2 mm accepted state. Studio approval records the user and applies −2 mm. Undo and Redo restore both states. Native Save and fresh Open keep the approved distance editable in History. The existing inner wall flow also passes in actual Studio.
- **PASS, native geometry.** Before approval, the outer diameter is 22 mm. After approval and fresh Open it is 14 mm. The bore diameter remains 8 mm. Both cap planes remain at Z0 and Z16, with the axis at (14, 9) mm. The independent formula π × (R² − 16) × 16 gives volumes within 5e−12 mm³ of the native 5277.875658030849 and 1658.7609210954065 mm³. All topological owner IDs agree, and fresh Open gives the same native digest `56916525acbe95a1e1f04f8fae30f6cf7af61abc1521db8e2f3e2e0e4a9b1e7b`.
- **PASS, affected checks.** 38 Model and 23 Studio tests, Model and Studio types, scoped lint, production build, driver syntax and Git diff. The Model test reports the native contact cause and rejects the unrelated radial and nonterminal cases. The actual proposal reports its standard candidate build refusal. Each desktop flow covered 1163 frozen files with zero changes, runtime errors and console errors.
- **FAIL, base capability.** The preceding tool discovery and Model regression explicitly refused this outer wall edit. The Studio History editor already supported it.
- **NOT_RUN.** Live providers, other renderers, exchange, mobile and full local suites. #322 and #629 remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate the runs. `D1603` is the outer output of `circular-wall-offset-browser.mjs --tube-outer` and `D1599` is the inner Agent output with both inputs. Keep the evidence outside Git.

```sh
pnpm --dir packages/barocss-cad-model test offset-face-native
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/features.ts,toolDefinitions.ts} packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/saved-wall-agent-browser.mjs
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/saved-wall-agent-browser.mjs
SAVED_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/saved-wall-agent-browser.mjs "$EVIDENCE/outer" "$D1603/second-native-doc.bcad" "$D1603/first-native-doc.bcad" --tube-outer
SAVED_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/saved-wall-agent-browser.mjs "$EVIDENCE/inner" "$D1599/older-saved-wall.bcad" "$D1599/current-saved-wall.bcad" --tube
git diff --check
```
