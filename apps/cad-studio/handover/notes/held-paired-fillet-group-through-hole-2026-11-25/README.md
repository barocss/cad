# D1987 — Replace both held edges of a paired Constant Fillet before an independent Through Hole through History

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `27d84731a7d118fb451f69a1e67d0b539371bad1`.

Offer History `Replace edges` group replacement when an original rectangular Extrude (`n1`) has a held two-edge Constant Fillet (`n2`) with both authored straight edges retired before an independent top Through Hole (`n3`). Read the earlier Fillet parent body (`b1`) through the existing Worker prefix evaluation. Match each picked line on `b3` to the exact complete unmerged native line on `b1` (same full name, raw endpoints in either direction, native axis-aligned plane supports) and require Through Hole clearance for the fillet radius. Refuse duplicates, stage both picks before any commit, write both signatures from `b1`, and evaluate the full chain before accepting.

- **FAIL, previous desktop Studio (`27d84731a`):** With both Fillet slots missing (`0 matched again · 2 need a choice`, two `Reference missing · Feature held`) before `Hole Ø4` on `b3`, History exposed neither `Replace edges` nor `Replace edge`. The open document and native solid stayed intact.
- **PASS, desktop Studio:** Seven WebGPU states passed with zero errors and 1,235 unchanged frozen source paths. Clicking the circular Hole rim (`[22, 0, 10]`) refuses (`Select a different original straight edge clear of the Through Hole.`). Staging `n1.side[e1]|n1.side[e4]` (`[-20, -20, 5]`) and clicking it again refuses duplicates while keeping `Apply edges` disabled. Cancel preserves the held document, history and native solid. Staging `n1.side[e1]|n1.side[e4]` and `n1.side[e2]|n1.side[e3]` (`[60, 20, 5]`) and clicking `Apply edges` atomically restores `n2` with exact `b1` signatures and keeps `n3` intact. Undo restores both held references; Redo, native Save and fresh Open preserve the repaired Fillet and original Hole.
- **PASS, independent expected geometry:** Held `80 × 40 × 10` mm stock with R2 Through Hole at `(20, 0)` mm has volume `32,000 − 40π` mm³ (strict valid, genus 1, two inward R2 hole half-cylinders, zero fillet cylinders). Explicit Apply adds two outward R2 fillet cylinders at `(−18, −18)` and `(58, 18)` mm while preserving both inward R2 hole half-cylinders and `n3` verbatim; strict valid, genus 1, volume `32,000 − 40π − 20(4 − π) = 31,920 − 20π` mm³.
- **PASS, affected checks:** 16 Studio `held-finish-replacement` tests, 47 Model `references` + `held-finish-recovery` tests, Model and Studio `type-check`, scoped ESLint, driver syntax, and `git diff --check`. Regression Chrome replays for D1986 (`held-paired-fillet-through-hole-browser.mjs`) and D1870 (`three-held-chamfer-browser.mjs --fillet`) also pass.
- **NOT_RUN:** Whole local suites, three-slot group replacement before downstream features, Chamfer group replacement before downstream features, other downstream feature families, local MCP diagnosis for this case, varying/curved/merged Fillets, and mobile. #20 remains open.

[Previous History without Replace edges](studio/00-no-group-replacement.png) · [Hole rim refused](studio/02-hole-rim-refused.png) · [Duplicate pick refused](studio/03-duplicate-pick-refused.png) · [Two staged picks awaiting Apply](studio/04-two-picks-await-apply.png) · [Repaired paired Fillet with Hole](studio/05-repaired-group-with-hole.png) · [Fresh native Open](studio/07-fresh-open-with-hole.png)

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
pnpm --filter @barocss/cad-studio-app test held-finish-replacement history-references
pnpm --filter @barocss/cad-model test references held-finish-recovery
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app type-check
export PW_DIR="$HOME/github/barocss/math"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
D1987_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$(mktemp -d /tmp/cad-d1987-replay.XXXXXX)"
```
