# D1530 — Prefer Smooth Turn for the general Twist search

P4, row 21, [#630](https://github.com/barocss/cad/issues/630). Base `1d4247ae2c09130d2f439032f0e90d012350a949`.

The command list puts Smooth Turn before Ruled Turn. Both commands match the general Twist search and have the same sketch prerequisites. The palette uses the existing command order for tied matches. Exact Ruled Turn and Smooth Turn labels keep their priority.

- **PASS, actual baseline.** Select one 12 × 8 mm sketch in desktop Studio. Type Twist in the command palette and press Enter. The previous first result is Ruled Turn. Applying its defaults produces a strict solid with 18 faces, 36 edges and 2560 mm³.
- **PASS, actual candidate and native read.** The same palette action launches Smooth Turn. At the same +360° and 40 mm, the result has 13 sections, six native faces, 12 edges and 3840.49391848882 mm³. A typed Ruled Turn exact name still creates the original result. Undo, repeat Twist, native Save and fresh Open reproduce the accepted Smooth digest.
- **PASS, affected checks.** 23 Model and nine Studio tests, scoped lint, Model types, Studio types and build, generated Agent inventory, browser syntax and Git diff. The Model defaults and geometry stay under their original validation.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Full local suites, mobile, additional browser backends, arbitrary profiles and helical screw. Faint default AO shading lines are covered by D1521. #630 remains open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and keep external evidence outside Git. Run the first desktop command before the product change.

```sh
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command revision-pinned-command toolset tool-contract
pnpm --dir apps/cad-studio test palette-rank palette-execution palette-list command-apply
pnpm exec eslint packages/barocss-cad-model/src/app/profileCommands.ts apps/cad-studio/test/palette-rank.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/twist-command-discovery-browser.mjs
git diff --check
cd apps/cad-studio
TWIST_DISCOVERY_FROZEN=1 node test/twist-command-discovery-browser.mjs "$EVIDENCE/baseline" --baseline
TWIST_DISCOVERY_FROZEN=1 node test/twist-command-discovery-browser.mjs "$EVIDENCE/candidate"
```
