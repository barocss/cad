# D2261 — Stage a Box width match through browser tools

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `37491b9e1`.

- **FAIL, base capability.** Built Studio registers the two read tools on an explicitly shared part with two original Boxes. No Box width proposal is available.
- **Decision.** An explicit one-use grant publishes `cad_part_propose_box_width_match`. Its arguments are the first and second body keys, `referenceSide` set to `left` or `right`, and the current revision from `cad_part_summary`. Original native edge endpoints resolve the first +X plane and the selected second plane inside the same revision. The existing Box edit proposal runs on the copy. Only Studio user approval applies it.
- **PASS, actual desktop Chrome.** Built WebGPU Studio uses the real `document.modelContext` API with no application probe. Revoked and spent grants refuse. Extra arguments, a stale revision, a wrong owner and an unsupported side refuse. The right-side preview increased the source volume by 1,224 mm³ and Reject preserved both bodies. The left-side preview increased it by 888 mm³. Accept, Undo, Redo and Project Save, Close and fresh Open preserve the selected result. Reopening starts with no tools until a fresh grant. Source diff matches before and after. There are zero console errors and downloads.
- **PASS, native proof.** Actual saved data retains all four feature IDs and the two authored Box commands. The source fixed wall stays at X=2.25 mm and the far wall is at X=32.75 mm. Volume is 1,464 mm³. The stationary reference is byte-identical in the strict native replay. The first standalone native inspector alias was too broad for package subpaths. The final check uses the Studio workspace package resolution.
- **PASS, affected checks.** Node 22.19.0, 30 Model and 14 Studio tests, Model and Studio types, changed-file lint, production build and whitespace.
- **NOT_RUN.** Placed or derived sources, direct browser edits, whole local suites, mobile and live model-provider workflows. The wider browser autonomy-policy condition in #204 remains open.

```sh
node packages/barocss-cad-model/scripts/test.mjs browser-extrude-proposal box-vertex-width-agent shell-corner toolset
(cd apps/cad-studio && node scripts/test.mjs webmcp proposal-review-availability tool-contract-mcp)
node node_modules/vite/bin/vite.js build apps/cad-studio --outDir "$OUT/dist"
bash "$OUT/built.sh" desktop-base --baseline
bash "$OUT/built.sh" desktop-01
git diff --check
```
