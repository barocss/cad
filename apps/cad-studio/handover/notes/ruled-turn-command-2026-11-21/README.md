# D1518 — Create a ruled turn from one rectangular sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `05be4a9cf8d8f455cb0d9bb365af0a73021e0c3a`.

Studio adds **Ruled Turn** to Create and to the command palette. Select one standalone rectangular sketch. Set a positive height and a signed angle from −450° to +450°. The axis passes through the rectangle centre along the sketch normal. The command snapshots the current dimensions, generates evenly spaced stations with at most 90° of rotation per span, and stores the corresponding corner guide in the ordinary native Loft. The source sketch stays exact. The generated frame uses unit directions, including when the stored sketch has scaled axes. The new Loft uses the existing document format and History editor. Its copied base width and depth can be edited while preserving the pinned corner. Height and total angle are creation inputs. This slice does not introduce a History control to reapply that generation recipe.

## Verification

- **PASS, desktop Studio.** The command refuses height 0 and angle 451° with Apply disabled. Cancel leaves the source exact. The +360°, −360° and +450° runs produce the expected native corner paths. For +450°, Undo, Redo, native Save and fresh Open pass. In the reopened file, edit the copied base width from 12 to 14 mm. The existing Loft keeps its body key, guide and remaining stations. A second native Save and fresh Open preserve the edit. A stored plane with normal length 2 and X direction length 3 passes the same workflow and produces the same native geometry.
- **PASS, native geometry.** At 12 × 8 mm, the ±360° turns measure 2560 mm³ with 16 rulings and 18 faces. The +450° turn measures 3200 mm³ with 20 rulings and 22 faces. The width edit adds 160/3 mm³, as derived from the changed first ruled span. Strict B-rep checks report one closed solid for each accepted case. Independent cardinal coordinates agree with every ruling endpoint and midpoint within 1e-8 mm.
- **PASS, focused checks.** 47 Model and 43 Studio tests, Model and Studio types, scoped lint, Studio build, generated Agent inventory, syntax and Git diff checks. Model proofs include a tilted frame, a parameter-bound rectangle, 0° and non-cardinal turns. The existing manual five-section Loft proof still passes. Independent geometry and source review found the scaled-frame gap before publication. The unit-frame correction passes the focused regression and desktop control.
- **NOT_RUN.** A continuous rigid twist, screw, nonrectangular profile, total angle or height editing after Save, live model provider, STEP, full local suites and mobile. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy work and freeze worktree writes during Studio. Evidence stays outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command loft-guide-command loft-section-history-edit api-loft-guide toolset tool-contract
pnpm --dir apps/cad-studio test command-apply history-feature-apply history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/{ruledTurnCommand,profileCommands}.ts packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/ruled-turn-command.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/ruled-turn-browser.mjs
git diff --check
cd apps/cad-studio
RULED_TURN_SOURCE_FROZEN=1 node test/ruled-turn-browser.mjs "$EVIDENCE/turn"
RULED_TURN_SOURCE_FROZEN=1 node test/ruled-turn-browser.mjs "$EVIDENCE/scaled-frame" --scaled-frame
LOFT_FULL_TURN_SOURCE_FROZEN=1 node test/loft-full-turn-sections-browser.mjs "$EVIDENCE/loft-control"
```
