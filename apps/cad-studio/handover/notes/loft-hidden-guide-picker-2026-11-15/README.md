# D1284 — Identify hidden sources in the Loft guide picker

2026-11-15 · SMALL · P5, row 07 · [Issue #548](https://github.com/barocss/cad/issues/548)

Both Loft creation guide fields append `(hidden)` to the name of an eligible Direct curve when its source object is hidden. The same option remains selectable. Loft copies the curve's control data. The picker's label does not change the source or add a link to the saved feature.

- **PASS — desktop Studio.** The original 10 × 6 mm section pair used one visible curve and one hidden curve. Studio's Direct Hide set only Rail B's visibility. The Loft picker showed `Rail A` and `Rail B (hidden)`. Preview retained the exact input document. Apply copied both guides and retained Rail B's visibility. The accepted 819.84 mm³ solid passed the strict native check. A guide-only History edit, refused gap, Undo, Redo, Save and fresh Open preserved the hidden source. The fresh document still showed it as hidden in the Browser.
- **PASS — single-guide Studio check.** Two circles of radius 3 mm at Z=0 and Z=12 used a hidden curved seam with middle X=5 mm. The first picker showed and selected `Rail A (hidden)`. The copied guide controls matched the source. Apply, Undo and Redo retained that source's hidden flag, and the worker volume matched `108π mm³`.
- **PASS — controlled checks.** Model type check, 12 Loft command tests, lint and whitespace check passed. The Chrome WebGPU flow ran at 1440 × 1000. All 906 frozen files matched after cleanup, with zero page or console errors. Reviewed both guide selection screenshots.
- **FAIL, corrected in the test setup.** Attempts to reuse the rectangular section pair with a single quadratic guide were refused. The reversed pick order first reached the plane-separation refusal. The positive order then reached the single framed profile-family refusal. The final single-guide check used the supported circular profile. The rectangular pair remains the two-guide fixture.
- **NOT_RUN.** Screen reader, WebGL2, mobile, full suites and new single-guide profile support.

## Commands and evidence

Node 22.19.0, heavy gate, desktop receipt SHA-256 `8e0aa5bb235cd61fab94716a5a783d23354d7066e3fe8487b615eeb4a7b4a461`. Saved rectangular Loft file SHA-256 `7ce105f28c07964e0c86b26bad1055ffe993dbd9c0b3410d04a386db80c6cbde`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft-guide-command
pnpm exec eslint apps/cad-studio/test/loft-two-guides-browser.mjs packages/barocss-cad-model/src/app/profileCommands.ts
D1275_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-guides-browser.mjs <external-evidence> --check-hidden
git diff --check
```
