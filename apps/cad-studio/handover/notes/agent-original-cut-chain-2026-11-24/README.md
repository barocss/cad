# D1899 — Describe and approve an earlier CUT through the direct Difference chain

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#25](https://github.com/barocss/cad/issues/25). Base `ceb9172b5ef2413863d12e933ee63a118054bc1e`.

Replace the obsolete fixed-depth source descriptions in the four local Agent cut-pattern commands. The command accepts an earlier Subtract in a contiguous chain of original rectangular through-Subtracts on the same stock. The current target, source and revision must resolve together.

- **FAIL, previous descriptions.** All four source descriptions said one or two cuts before the target. [D1894](../rectangular-cut-difference-chain-2026-11-24/README.md) already verifies the wider certified chain.
- **PASS, local Agent.** Four real Describe results expose the chain. A Rectangular dry run uses source `n4` on current target `n13` with X8/Y8 mm, Count 2×2. It gives −240 mm³ and keeps the original file exact. A stale revision, using the target as the source, X16 and Y18 collision cases, and an Agent-only Accept all refuse without applying an edit.
- **PASS, actual desktop Studio.** Six first-of-four and six two-cut control states. The pending and preview scenes keep all four original cuts. Explicit user approval makes three new apertures. Strict native topology is one genus-seven solid with 34 faces, 48 loops, 192 coedges, 96 edges and 64 vertices. Native volume is 23,400 mm³ and centroid `(30.28205128205128, 20.135042735042735, 5)` mm. Native Save and fresh Open preserve all seven apertures, source `n4` and target `n13`.
- **PASS, affected checks.** 34 Model and 2 Studio tests, Model type checking, focused lint, browser syntax and Git diff check.
- **NOT_RUN.** Whole local suites, local production build, live providers, other cutter families, general dependent-reference recovery and mobile. #25 stays open. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
D1899_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --agent-four
D1829_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/two-cut" --agent
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-browser
pnpm --dir packages/barocss-cad-model type-check
git diff --check
```
