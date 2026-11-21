# D1557 — Pin Agent Smooth Screw pitch edits to the reviewed part

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322) · Base 4d73d545665484f9baf3daa7f0ac79b9d8c21b68.

The local Agent can discover and propose `features.edit` with one `values.smoothScrewPitch` in mm per revolution. Require the current part revision and an intact terminal external-axis Screw. Reject missing, malformed, stale, mixed, invalid and unchanged requests before evaluation. Use D1556's pitch field and the existing proposal and Studio History paths. The generic Loft height key remains available.

- **PASS, actual local MCP and desktop Studio.** Review the earlier pitch 40 model at revision `10e31245401314f6` and pitch 56 at revision `6dcf53da75a2c2bc`. Their review image digests differ. Refuse a direct L1 edit, a missing or stale revision, excess advance, a mixed request, an unchanged value and tool-side acceptance. Preview pitch 64 while the accepted document remains exact. Accept in Studio as the user. Undo and Redo restore the exact documents. Save and fresh Open retain pitch 64 and the same native B-rep.
- **PASS, independent geometry.** At −450° the advance changes from 70 to 80 mm. Check all 16 stations on each of four rails with the original axis and signed rotation. Preserve the upstream nodes, solid key, six faces, twelve edges and all native topology IDs. Volume changes from 6,720.392181799152 to 7,680.448207770453 mm³. The accepted and reopened B-rep digest is `30c38cc09eff4f36c2f64c45af4b1d37bb44b409380e8e9a2188a0032cdb7641`. The existing centred rectangular Turn width proposal also passes in actual Studio. Both frozen runs report zero runtime errors, console errors and source changes.
- **PASS, affected checks.** 30 Model tests, 17 Studio tests, both type checks, Studio production build, scoped ESLint, Agent inventory, browser syntax and Git diff. The tested per-turn prompt and tool payload remains 24,832 characters against the 25,000 cap.
- **FAIL, visual parity.** The actual proposal preview shows stronger facets than the approved Model view. Code inspection finds that the proposal evaluation does not request refined display packets. The current viewport also excludes proposal overlays from its ordinary refined path. Verify the uploaded packets before changing that path. The preview and acceptance checks above qualify data and approval, not visual parity.
- **NOT_RUN.** Live model providers, second renderer for the approval flow, Screw winding edits, neutral export, arbitrary profiles and full local suites. Both issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate each heavy run and keep all evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/features.ts,toolDefinitions.ts} packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle revision-pinned-command tool-contract toolset
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp proposal-review-availability
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/screw" "$D1552/agent-approved-smooth-screw.bcad" "$D1556/smooth-screw-pitch-56.bcad" --screw
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/width-control" "$D1538/original-smooth-turn-width-12.bcad" "$D1538/smooth-turn-width-16.bcad" --width
```
