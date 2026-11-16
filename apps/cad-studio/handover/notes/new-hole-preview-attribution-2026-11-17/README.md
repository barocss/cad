# New Hole preview is not a missing History step

2026-11-17 · #22 · original checklist lines 1857–1863

## Narrow contract

An exact Hole feature ID present in the evaluated preview but absent from accepted History does not receive the misleading `no matching history step` annotation. The current Hole HUD, refusal title, input-specific Centre guidance, native code and Kernel detail remain unchanged. Unknown IDs, generated pattern suffixes, accepted/downstream features and newly previewed Fillet keep their existing attribution. No kernel, document/schema, worker protocol or protected `useCommandPreview.ts` change.

## Evidence

- **BASELINE reproduced**: actual Chrome `/tmp/cad-hole-attribution-before` with `--baseline` shows `Failed feature · n1 · no matching history step` for an unapplied Hole at X30/Y10 on the original 20×20×2 Thicken slab. Apply is disabled and the accepted document is unchanged.
- **PASS fixed**: `/tmp/cad-hole-attribution-after` removes only that annotation. The visible instruction still identifies Hole 1 at X30/Y10 and asks to adjust Centre or pattern spacing. Kernel detail remains available. Baseline and fixed screenshots were visually inspected.
- **PASS recovery**: X10 restores preview without modifying the accepted document. Applying produces the expected centre and Ø8 hole; strict native B-rep validation passes, volume equals `800 - 32π` within 1e-6 mm³. Undo restores the exact original document and Redo restores the exact accepted hole.
- **Original fixture, not synthetic**: the driver embeds the accepted `doc` from `/tmp/barocss-sketch-dimensions.A2LhgMMS/results/desktop-56e82b8eb-hole-in-thicken-slab-ux-verified/02-centred-hole-preview.json`, including the original ruled-surface direct sources. The driver source capsule records its bytes.
- **PASS focused**: failed-feature tests 6/6, including exact new Hole, generated `n45_p1`, unknown ID, accepted Hole, downstream Fillet and new Fillet attribution. Target lint, Studio tsc and diff check pass. Logs `/tmp/cad-hole-attribution-{tests,lint,tsc}.log`.
- **NOT_RUN**: full suites, mobile, Save/Open (no saved-data change), additional command families. Lines 2019–2026 disconnected pieces/contact-depth guidance remain separate work. Existing D749 lifetime machinery is reused, not modified.

```sh
HOLE_ATTRIBUTION_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node apps/cad-studio/test/new-hole-preview-attribution-browser.mjs /tmp/cad-hole-attribution-before --baseline
HOLE_ATTRIBUTION_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node apps/cad-studio/test/new-hole-preview-attribution-browser.mjs /tmp/cad-hole-attribution-after
```

Run under the serial heavy gate after freezing checkout writers. No browser downloads or source mutations during either browser run.

Integration verification: production build PASS in 3.82s; root independently reviewed the final refusal screenshot and receipt.
