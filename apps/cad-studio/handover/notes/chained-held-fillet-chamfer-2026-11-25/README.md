# D1988 — Hold and recover chained Fillet and Chamfer features sharing one retired sketch side

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `11c19b886c9d5305a2fcabd3f42160194d89096a`.

Evaluate each referencing feature's parent body lazily in node order during `verifyReferences` against the current `out` document rather than upfront before earlier features are held. When an upstream sketch side retires while shared by an earlier two-edge Constant Fillet (`n2`) and a downstream Constant Chamfer (`n3`), holding `n2` lets `n3`'s parent prefix evaluate cleanly so both features are held with their exact candidates instead of silently skipping `n3` and failing Open.

- **Previous Chrome and Model (`11c19b886`):** `verifyReferences` evaluated `prefixDoc(out, 3)` upfront while `n2` was still un-held, received no parent body for `n3`, and returned only `n2`'s problem (`n1.bottom|n1.side[e1] → [n1.bottom|n1.side[e5]]`). Evaluating the resulting document failed on `n3` (`no edge named n1.side[e1]|n1.top`), so Studio refused Open (`Your part is unchanged`) and left the previous model intact.
- **Same-owner control:** narrowing the original `80 × 40 × 10` mm rectangle to `80 × 38 × 10` mm while keeping `e1` opens with zero reference problems and keeps both bottom R2 Fillets and the top 1 mm Chamfer intact (`30,400 − 160(4 − π) − 40` mm³).
- **Current Chrome:** retiring `e1 → e5` opens cleanly with both `Fillet R2 (n2)` and `Chamfer 1 (n3)` held (`0 matched again · 2 need a choice`, original slots and signatures preserved, `rematched: undefined`) on the `80 × 38 × 10` mm stock (`30,400` mm³). Previewing `n2`'s candidate highlights `n1.bottom|n1.side[e5]` without changing the document or Undo/Redo. Confirming `n2` first restores both bottom R2 Fillets (`30,400 − 160(4 − π)` mm³, two outward R2 horizontal cylinders at `y = −16` and `18`, `z = 2` mm, keeping `n1.bottom|n1.side[e3]` and its saved signature verbatim) while `n3` remains held. Confirming `n3` next restores the top 1 mm bevel on `n1.side[e5]|n1.top` (`30,400 − 160(4 − π) − 40` mm³, strict valid, genus 0). Two-step Undo restores `n3`-only held and then both-held; two-step Redo, native Save and fresh Open preserve the exact full chain. Five captured desktop states, zero errors, and 1,233 unchanged frozen source paths.
- **Focused checks:** 74 Model tests (`references`, `half-ring-fillet-reference`, `held-finish-recovery`, `band-surface`, `drawing-body-reference-recovery`), 16 Studio `held-finish-replacement` tests, Model and Studio `type-check`, scoped ESLint, driver syntax, and `git diff --check`. Regression Chrome replays for D1984 (`partial-held-constant-fillet-browser.mjs`) and D1985 (`downstream-held-constant-fillet-browser.mjs`) also pass.
- **NOT_RUN:** Whole local suites, downstream features whose own target face/edge was created by an earlier held feature (still safely refused on Open when unsigned), History multi-feature group replacement, arbitrary imported topology, and mobile. #20 remains open.

[Previous Open refused on downstream Chamfer](studio/01-previous-chained-open-refused.png) · [Both chained finishes held](studio/02-both-chained-held.png) · [Fillet confirmed while Chamfer stays held](studio/04-fillet-confirmed-chamfer-held.png) · [Both finishes confirmed](studio/05-both-confirmed.png) · [Fresh native Open](studio/06-fresh-open.png)

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
pnpm --filter @barocss/cad-model test references half-ring-fillet-reference held-finish-recovery band-surface drawing-body-reference-recovery
pnpm --filter @barocss/cad-studio-app test held-finish-replacement
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app type-check
export PW_DIR="$HOME/github/barocss/math"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
D1988_SOURCE_FROZEN=1 node apps/cad-studio/test/chained-held-fillet-chamfer-browser.mjs "$(mktemp -d /tmp/cad-d1988-replay.XXXXXX)"
```
