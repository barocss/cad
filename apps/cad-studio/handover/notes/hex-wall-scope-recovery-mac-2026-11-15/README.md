# D1369 — Hexagonal-prism side Offset recovery

Base `d36fb31487880363361c5c3a3943be49e429da77`. Resolves #140 with bounded refusal feedback; native geometry support unchanged.

## Implementation

`src/state/commandBuildFailure.ts` recognizes the exact unpartitioned-cap-profile VALUE refusal only for a current original XY straight hexagonal Extrude cardinal side. It explains that changing distance cannot enable this face and directs Cancel then an oblique side selection. Unsupported unrelated errors, stale references, caps and oblique selections retain their existing paths. `src/ui/Hud.tsx` shows the Offset Move completed check only after successful preview, not merely a nonzero input.

## Verified

- Focused cap/hex feedback tests 8/8, Model and Studio TypeScript, scoped lint and diff check PASS.
- Production Vite build PASS.
- Actual Chrome `hex-wall-scope-recovery-browser.mjs`, 1024 and 1440 desktop widths: Front cardinal side +2/−2 refusal with readable next action, disabled Apply, no false completed Move check and unchanged document. Cancel then Iso oblique side +9.599 application, History −9.599 edit, Undo/Redo and downloaded Save/fresh Open PASS.
- Existing independent rational polygon/plane oracle verifies all vertices, face normals, plane equations, trim charts, strict BRep counts, native and Studio volume. Native topology IDs, incidence and pcurve binding identity retained.
- Actual pixel review: `1024-cardinal-refused.png` shows the selected cardinal wall, readable guidance and incomplete Move indicator; `1440-inward.png` shows the recovered solid. Browser label rounds −9.599 to −9.6; authored exact value is separately asserted, not changed by this work.
- Artifacts `d1369-first`; receipt SHA256 `0f2033ca9bda1afc6e027c6394a920572017c391ea900e85d3cef5ea1b7ca7fa`. Automated receipt placeholder is not a visual verdict; the preceding paragraph records actual review.

## Limits

Original XY six-sided fixture only; no new arbitrary plane/hex geometry support or availability preflight. No whole-suite/CI or full docs gate claim. D1365 accumulated API inventory drift and #22 broader acceptance remain open. Existing HOLDs unchanged. Next D1370/#142: owned Reference plane failure feedback and recovery.
