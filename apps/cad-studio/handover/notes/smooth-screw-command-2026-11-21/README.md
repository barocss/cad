# D1552 — Author an external-axis Smooth Screw from one rectangular sketch

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322) · Base ff1ba6ee18813c06b665dd081f16b575533a088f.

Smooth Screw uses one standalone straight rectangle. Axis X and Axis Y locate the external normal in sketch coordinates. Positive pitch is the advance per full revolution. The signed nonzero angle selects the winding, and the axial advance is pitch times the absolute angle divided by 360. The command copies each section into a common sketch plane whose origin is the axis point, preserves the original sketch, and uses the D1551 compact Smooth Loft. The same geometry gives the existing refined Model packet with analytic side normals. The saved Loft has Total height in History. Its file schema and the separate centred Turn inputs stay the same.

- **PASS, actual Studio and local MCP.** From two sketches, target the first rectangle by its stable ID and current part revision. Refuse direct mutation at L1, missing or stale revisions, the wrong sketch, an axis within the rectangle, and tool-side proposal acceptance. Preview the pending −450°, 40 mm pitch Screw. Accept in Studio, Undo and Redo, save, then open in a fresh context. The explicit approval is recorded as a user action.
- **PASS, manual and Agent equality.** In desktop Studio, create the same Screw directly from Sketch 1 with Axis X −1 mm and Axis Y +1 mm, pitch 40 mm and angle −450°. The 16 sections produce a 50 mm axial advance in both paths. The same six-face closed solid has volume 4800.2801298565255 mm³ and native digest c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661 before and after native Open. The original sketch and output nodes agree exactly. The reopened Model packet uses 1,092 refined triangles in place of 362. Faint marks near the inner creases remain in the shown lighting.
- **PASS, affected checks.** 33 Model and 20 Studio tests, scoped ESLint, Model types, Studio production build and types, Agent inventory consistency, browser syntax and Git diff. The existing centred Smooth Turn still passes the actual local MCP and Studio test. The browser receipts report zero runtime errors, console errors and frozen-source changes.
- **FAIL, corrected tool budget.** Adding the command name took the per-turn tool and prompt payload to 25,001 characters against the 25,000 cap. Removing redundant introductory wording reduces it to 24,832 characters with the same tools and rules.
- **NOT_RUN.** Live model providers, other desktop backends for this command, Screw pitch and winding History, STEP exchange of this Screw, arbitrary profiles, mobile and full local suites. Both issues remain open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and keep run artifacts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-screw-command smooth-turn-angle ruled-turn-command revision-pinned-command tool-contract toolset
pnpm --dir apps/cad-studio test palette-rank toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/screw" --screw
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/centred-control" --smooth
```
