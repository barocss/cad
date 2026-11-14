# D1285 — Keep the chosen duplicate guide in Loft History

2026-11-15 · SMALL · P5, row 07 · [Issue #155](https://github.com/barocss/cad/issues/155)

The Loft History picker retains the selected source ID in its current editor draft. The saved feature still stores the guide coordinates independently. After Reset, reopening the History editor, or native Save/Open, the picker displays `Current copied guide`. Selecting a source with the current guide geometry only updates the displayed name and leaves Apply disabled.

- **PASS — desktop Studio.** Duplicated Rail B in Direct geometry and selected `Rail B copy` in Loft History. Switched between the two equal source curves three times, and each selected name stayed in the picker. Each draft left the accepted document unchanged. Apply copied the bow from the chosen source. Selecting the same guide geometry after Apply left the feature unmodified, and Reset restored the current copied guide label. Undo, Redo, native Save and fresh Open passed. The existing endpoint refusal still kept the accepted document.
- **PASS — independent geometry.** The three 10 × 10 mm sections at Z=0, 10 and 20 retained volume 2,000 mm³ to within 1e-12 mm³. The replaced and reopened seam points were X=2 mm at Z=5 and Z=15, and the centroid shifted from X=5 to X=6 mm. Both accepted states and the reopened state had one valid native solid.
- **PASS — controlled checks.** Model type check, Studio production build, lint and Git whitespace. The final desktop Chrome WebGPU run at 1440 × 1000 matched 904 frozen files after cleanup and had zero page or console errors. Reviewed the selected source and edited solid screenshots.
- **FAIL, corrected.** The first draft passed the duplicate-name check but still enabled Apply when the selected source matched the saved guide. The editor now keeps its existing draft when the field setter returns the same Loft node. A short-lived attempt to return the original read-only node array from the Model setter failed type check and was removed.
- **NOT_RUN.** Screen reader, WebGL2, mobile and full local suites.

## Commands and evidence

Node 22.19.0, heavy gate. Desktop receipt SHA-256 `e27bad6f6fb03dd1337440f879d7dc2236862fdab7340b2725fe9508b230c967`. Native Save SHA-256 `a4afed8fc853ca6e4f46d2e66656a57ba2a607216deb851254fcb7c378ce4cbc`.

```sh
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
pnpm exec eslint apps/cad-studio/src/ui/NodeEditor.tsx apps/cad-studio/test/loft-history-guide-replacement-browser.mjs
D1171_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-history-guide-replacement-browser.mjs <external-evidence> --check-duplicate
git diff --check
```
