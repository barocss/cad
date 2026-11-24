# D1947 — Discover and approve a three-section guided Loft through the local Agent

P1 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md) and [row 12](../../roadmap-rows/12.md), [#324](https://github.com/barocss/cad/issues/324). Base `fdcd690b361eb90425f2de7c8773511af1368e0f`. Feature change.

The Agent's Loft description states the exact three-section station and corner rules. Native refusals now identify an off-guide middle corner, a middle station away from halfway, and a crossed full guide pair. The existing proposal and explicit approval paths carry the same CAD feature and kernel rules as Studio.

- **FAIL, previous discovery and recovery guidance.** The pinned local MCP description only advertised two rectangles. The first current run confirmed that an invalid middle contact was safely refused with only generic advice. The accepted run identifies the actual middle contact and the exact correction.
- **PASS, actual local MCP.** The describe call advertises three horizontal sections at 0, H/2 and H and both exact minimum-Y contacts. At L1, direct authoring and direct acceptance are refused. Off-middle guide, wrong middle height, reversed pair and conflicting guide inputs preserve the native bytes. The valid proposal keeps the accepted document and bodies unchanged while it awaits approval.
- **PASS, actual desktop Studio.** Preview and Hide affect the displayed candidate only. Explicit Studio approval records the human decision and the Agent proposal. Undo restores the pending proposal and Redo restores the approved model. A guide edit off the middle corner is refused and Reset restores the approved input. Save and fresh Open preserve the three sections, all four native rail segments and the one strict 10-face, 20-edge, 12-vertex solid. A fresh local MCP session reads the same saved feature, approved proposal and 2401.143 mm³ summary.
- **PASS, independent native value.** With the exact D1945 middle section, the lower half has width 10+8u−4u² and aspect ratio (21+9u)/35. Both halves give 16808/7 mm³. Studio native and Worker values match within 1e−8 mm³. The original two-section local Agent and Studio approval flow also passes.
- **PASS, affected checks.** 37 Model and 11 Studio tests. The per-turn budget remains 24775 characters. Model and Studio types, scoped ESLint, Studio production build and diff check pass.
- **FAIL, corrected intermediate browser assumption.** The first approval run reached the accepted geometry. Its driver expected the two-section Mode label in three-section History. The final driver checks the actual guide fields and the rejected edit.
- **NOT_RUN.** Live providers, billing, natural-language task success, other section arrangements, full local suites and mobile. #324 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1276_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-agent-proposal-browser.mjs "$OUT/three" --three
D1276_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-agent-proposal-browser.mjs "$OUT/two"
node packages/barocss-cad-model/scripts/test.mjs toolset.test tool-contract.test loft-guide
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback mcp
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The local MCP wire evidence and actual desktop scenes remain outside Git.
