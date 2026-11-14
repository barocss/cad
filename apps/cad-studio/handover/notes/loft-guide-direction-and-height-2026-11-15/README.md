# D1286 — Explain Loft guide direction and height at the picker

2026-11-15 · SMALL · P5, row 07 · [Issue #154](https://github.com/barocss/cad/issues/154)

The Loft creation HUD shows the selected name in its picker. The picker tooltip explains that Loft copies the curve. A single polynomial guide that fails the native strict-rise check receives one message under its field. For a strictly downward guide of degree 1–3 the message suggests Reverse in Direct geometry or another guide. For a downward higher-degree guide it suggests another guide in the correct direction. For a level or mixed control height it explains the strict-rise rule along the section normal. The native evaluation retains authority over acceptance.

- **PASS — desktop Studio.** Opened two 1 × 1 mm XY rectangular sections at Z=18 and Z=20. Selected a downward polynomial cubic and a quartic with two equal control heights. Each selection had one message at the first guide field and an explicit accessible association. Apply stayed disabled, and both refusals retained the exact input document. The selected name appeared only in the picker inside the HUD. The general kernel panel and draft feature ID stayed out of these two messages.
- **PASS — correction and persistence.** Reversed the descending cubic through the actual Direct geometry Reverse command and picked the resulting guide. The warning cleared, the original sketches stayed in place, and Apply copied the reversed control points. Undo, Redo, native Save and fresh Open passed. The Worker and independent native read matched 2 mm³ within 1e-8 mm³. Strict validation found one closed solid with six faces and twelve edges on both accepted states.
- **PASS — controlled checks.** Studio production build, focused lint and Git whitespace. Zero page or console errors. The frozen files matched after cleanup. Reviewed the two refusal and corrected preview screenshots.
- **FAIL, corrected.** The first workflow tried to reverse a quartic in Direct geometry. That operation admits degrees 1–3. The final workflow uses a downward cubic with one interior knot for Reverse and a separate non-rising quartic. The higher-degree downward hint now directs the user to choose another guide.
- **NOT_RUN.** Screen reader, WebGL2, mobile, non-XY section frameworks, the upstream edge-to-Direct conversion step, and full local suites. The test supplies polynomial Direct sources with the reported endpoints.

## Commands and evidence

Node 22.19.0, heavy gate, desktop Chrome WebGPU 1440 × 1000. Receipt SHA-256 `399a401f676d977da413ac6823fce444bc9f80f4bfc19d8e8a74e8bb2b8a7bc6` with 904 frozen files. Native Save SHA-256 `a9e89cc537745d9f7a7ea9fbe193ab425217506ce566602f1c5129deef7b61e4`.

```sh
pnpm exec eslint apps/cad-studio/src/app/loftGuideFeedback.ts apps/cad-studio/src/ui/Hud.tsx apps/cad-studio/test/loft-guide-direction-browser.mjs
D1286_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-guide-direction-browser.mjs <external-evidence>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```
