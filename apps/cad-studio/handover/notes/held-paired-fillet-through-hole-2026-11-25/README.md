# D1986 — Replace one held edge of a paired Constant Fillet before an independent Through Hole through History

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `9426b4ba11c26c40e107d44b5dcd34c7a4e21a76`.

Offer the existing History `Replace edge` flow when an original rectangular Extrude (`n1`) has a held two-edge constant Fillet (`n2`, one retired straight edge and one retained straight edge with its original signature) followed by an independent top Through Hole (`n3`). Read the original Fillet parent body (`b1`) through the existing Worker prefix evaluation and re-check the retained edge signature on `b1`. The picked line on `b3` must match the exact complete unmerged native line on `b1` (same full name, raw endpoints in either direction, and native axis-aligned plane supports) and stay clear of the Through Hole for the fillet radius. Write the parent line signature only for the retired slot, preserve the retained slot and its saved signature verbatim, and evaluate the full chain before committing.

- **FAIL, previous desktop Studio (`9426b4ba1`):** When the retired slot had no automatic candidate (`Reference missing · Feature held`), opening `Fillet R2 (n2)` in History exposed no `Replace edge` action while `Hole Ø4` owned `b3`. The open document and native solid stayed intact.
- **PASS, desktop Studio:** Seven WebGPU states passed with zero errors and 1,234 unchanged frozen source paths. Clicking the circular Hole rim (`[22, 0, 10]`) refuses (`Select a different original straight edge clear of the Through Hole.`). Clicking the already-used retained vertical edge (`n1.side[e2]|n1.side[e3]` at `[60, 20, 5]`) refuses (`This feature already uses that edge.`). Clicking the original vertical corner edge (`n1.side[e1]|n1.side[e4]` at `[-20, -20, 5]`) previews it in cyan and displays its name without changing the document or Undo/Redo. Refusal and Cancel preserve the held document, history and native solid. Explicit Apply restores `n2` with `[n1.side[e1]|n1.side[e4], n1.side[e2]|n1.side[e3]]` and keeps `n3` intact. Undo restores the hold; Redo, native Save and fresh Open preserve the repaired Fillet and original Hole.
- **PASS, independent expected geometry:** The `80 × 40 × 10` mm stock has an R2 Through Hole at `(20, 0)` mm (`32,000 − 40π` mm³ while held, strict valid, genus 1, two inward R2 hole half-cylinders, zero fillet cylinders). Explicit Apply adds two outward R2 cylindrical faces at `(−18, −18)` and `(58, 18)` mm while preserving both inward R2 hole half-cylinders and `n3` verbatim; strict valid, genus 1, volume `32,000 − 40π − 20(4 − π) = 31,920 − 20π` mm³.
- **PASS, affected checks:** 16 Studio `held-finish-replacement` tests, 47 Model `references` + `held-finish-recovery` tests, Model and Studio `type-check`, scoped ESLint, driver syntax, and `git diff --check`. Regression Chrome replays for D1902 (`held-chamfer-through-hole-browser.mjs`) and D1985 (`downstream-held-constant-fillet-browser.mjs`) also pass.
- **NOT_RUN:** Whole local suites, multi-slot group replacement before downstream features, other downstream feature families, local MCP read diagnosis for this case, varying/curved/merged Fillets, and mobile. #20 remains open.

[Previous History without Replace edge](studio/00-no-history-replacement.png) · [Hole rim refused](studio/02-hole-rim-refused.png) · [Retained duplicate edge refused](studio/03-duplicate-stable-refused.png) · [Original corner edge preview](studio/04-original-edge-preview.png) · [Repaired Fillet with Hole](studio/05-repaired-with-hole.png) · [Fresh native Open](studio/07-fresh-open-with-hole.png)

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
pnpm --filter @barocss/cad-studio-app test held-finish-replacement history-references
pnpm --filter @barocss/cad-model test references held-finish-recovery
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app type-check
export PW_DIR="$HOME/github/barocss/math"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
D1986_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs "$(mktemp -d /tmp/cad-d1986-replay.XXXXXX)"
```
