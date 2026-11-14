# D1279 — Drill a through Hole on a two-guide Loft

2026-11-15 · FEATURE · P5, rows 07 and 08

The existing Hole command drills a vertical bore into the planar cap of the qualified two-guide Loft. The bore stays inside all intermediate sections. The existing native Boolean retains both guide edges and trims the two caps against the bore.

- **PASS — desktop Studio.** Picked the upper cap at (5, 3) mm using the viewport. Applied a through Hole with diameter 2 mm. Changed its diameter to 2.5 mm in History, then used Undo and Redo. Native Save and fresh Open restored the same Hole and Loft recipes and the edited solid. Reviewed three screenshots.
- **PASS — independent geometry.** Subtracted `12πr²` from the analytical Loft volume of 819.84 mm³. The expected volumes were `782.1408881569225` and `760.9351377451915 mm³`. The native provider and Studio worker differed by at most `2.9e-12 mm³`. Verified the centroid by subtracting the bore's first moments. Strict B-rep reported one closed solid of genus 1 and eight native faces. The top and bottom each had a two-edge circular inner loop. The two inward cylinder patches had the correct radius. Both exact outer guide edges retained two incident uses and matched their original samples at five heights.
- **PASS — focused checks.** Syntax, lint and whitespace checks. Current-source Model TypeScript API also built and encoded both diameters and passed strict B-rep and the same volume oracle.
- **FAIL.** None in the checks above.
- **NOT_RUN.** Full local suites, mobile, paid inference, angled bores, and bores that cross a side wall.

## Commands and evidence

Node 22.19.0. The gate serialized the desktop run. Studio checked 901 frozen files with zero page errors, console errors, or source writes. Receipt SHA-256 `d29a4f19da1c442e3b71049cc111c4aa564425fb60f53cdb490a111c4ce61d39`. Saved `.bcad` SHA-256 `9fe60ac4bf7ecfe60be8c945e325b453dff753a1db89235fe281a76227e78440`. The edited and reopened native inspections share SHA-256 `f8217d18a9c7a202b1b196f2e7bd142d5299173987d2f2258c690f13d987202c`.

```sh
D1279_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-hole-browser.mjs <external-evidence>
node --check apps/cad-studio/test/two-guide-loft-hole-browser.mjs
pnpm exec eslint apps/cad-studio/test/two-guide-loft-hole-browser.mjs
git diff --check
```
