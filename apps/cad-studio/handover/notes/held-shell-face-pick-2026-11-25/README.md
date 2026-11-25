# D2001 — Direct 3D viewport planar face replacement for a held single-opening Shell (#20)

Date: 2026-11-25 · Track: P1 Reference recovery · Issue: [#20](https://github.com/barocss/cad/issues/20)

## Decision

Add direct 3D viewport face picking with explicit confirmation (`Replace face` → 3D click → `Apply face` / `Cancel`) in History `NodeEditor` for a held single-opening Shell whose visible passthrough solid exposes verified planar candidate opening faces. Narrowed strictly to verified planar candidates owned by the single visible passthrough solid (`heldShellCandidateFace` from D2000): non-candidate faces are refused without mutating the document or history, picking highlights only the chosen planar face without applying it, Cancel/Escape leaves document and history untouched, and explicit `Apply face` releases only the Shell while leaving downstream held finishes suppressed with refreshed candidates.

## Changes

- `apps/cad-studio/src/state/heldShellFaceReplacement.ts`: pure admission (`heldShellFaceProblem`), viewport hit validation (`pickHeldShellFace`), and replacement construction (`replaceHeldShellFace`) with named TypeScript interfaces.
- `apps/cad-studio/src/state/useHeldShellFace.ts`: session hook managing 3D face preview (`previewSelection`), failure notice retirement, worker evaluation (`engine.part`), downstream problem refresh (`refreshDownstreamProblems`), and single-Undo commit.
- `apps/cad-studio/src/viewport/sceneSelection.ts`, `apps/cad-studio/src/app/useStudioKeyboard.ts`, `apps/cad-studio/src/ui/HistoryFeatureEditor.tsx`, `apps/cad-studio/src/ui/NodeEditor.tsx`, `apps/cad-studio/src/App.tsx`: route face picking (`pickFilter: 'face'`), Escape dismissal, face highlight, and `Replace face` / `Apply face` / `Cancel` controls.

## Verification

- **Studio unit tests:** 16/16 PASS across `held-shell-face-replacement`, `held-shell-candidate-preview`, `reference-decisions`, and `held-draft-face-replacement`.
- **Type-check, ESLint, and build:** `@barocss/cad-studio-app` `type-check`, scoped ESLint on all 8 touched files, and `pnpm build` all PASS.
- **Actual Chrome Studio (`apps/cad-studio/test/held-shell-face-pick-browser.mjs`, `D2001_SOURCE_FROZEN=1`) on U-block fixture:**
  - Baseline (`--baseline`): PASS (`00-previous-no-shell-face-pick.png` confirms no `Replace face` control on held Shell).
  - Current Studio: PASS across wrong-face refusal (`n1.top` at `[0, 15, 12]` → `Face not selected`, `Apply face` disabled, `31,200 mm³` & Undo/Redo unchanged), direct 3D pick of `n1.side[s1]` (`[-5, -20, 6]`, `360 mm²` plane highlighted in cyan, refusal toast retired, doc/history unchanged), `Cancel` preserving doc/history, re-pick + explicit `Apply face` releasing Shell (`14,642.265 mm³`, `genus 0`) while keeping downstream Chamfer (`n3`) held and refreshing its candidate to `n1.side[s1]#3|n2.ceiling`, explicit Chamfer confirmation, 2-step Undo/Redo, and `.bcad` Save + fresh Open.
- **D2000 regression (`dependent-shell-chamfer-reverify-browser.mjs --shell-preview`, `D1992_SOURCE_FROZEN=1`):** PASS.

## Captured Studio scenes

- [00-previous-no-shell-face-pick.png](00-previous-no-shell-face-pick.png) — Baseline Studio before direct 3D face replacement on held Shell.
- [01a-wrong-face-refused.png](01a-wrong-face-refused.png) — Clicking non-candidate `n1.top` refuses selection (`Face not selected`), keeps `Apply face` disabled, and leaves `31,200 mm³` solid unchanged.
- [01b-picked-shell-face-preview.png](01b-picked-shell-face-preview.png) — Clicking verified planar candidate `n1.side[s1]` highlights only that `360 mm²` opening face and enables `Apply face` without mutating document or history.
- [02-shell-applied-chamfer-refreshed.png](02-shell-applied-chamfer-refreshed.png) — Explicit `Apply face` restores the 2 mm Shell cavity while keeping downstream Chamfer held (not auto-applied) with refreshed candidates.
- [03-both-restored.png](03-both-restored.png) — Separate explicit confirmation of refreshed Chamfer restores the inner rim chamfer.
- [04-fresh-open.png](04-fresh-open.png) — Native `.bcad` Save and fresh Studio Open after 2-step Undo/Redo preserves exact Shell + Chamfer geometry.

## Remaining scope

- Multi-opening held Shells, non-candidate / arbitrary topology replacement, curved opening faces, and general downstream feature families remain open under [#20](https://github.com/barocss/cad/issues/20).
