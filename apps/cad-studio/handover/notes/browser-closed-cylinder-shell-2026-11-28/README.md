# D2233 — Propose a closed Cylinder Shell through WebMCP

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `64cd33156`.

Studio publishes `cad_part_propose_closed_shell` for one grant on the current standalone command-made Cylinder. It binds the body key and revision from `cad_part_summary`. The wall, floor and ceiling accept separate finite millimetre values. The existing Shell command and native evaluation check the cavity. The browser stages a proposal. A person previews, rejects or accepts it in Studio.

- **PASS, actual built Studio.** Chrome 158.0.8127.89 used the real WebMCP API, WebGPU and built assets on a secure loopback origin. The source Cylinder has radius 15 mm, height 20 mm and bounds [−1, −6, 3] to [29, 24, 23] mm. A wall of 2 mm, floor of 3 mm and ceiling of 5 mm removes 2,028π mm³. The displayed preview delta was −6,371.15 mm³. Rejection and Undo kept the stock volume of 14,137.167 mm³ and revision `e554af4498ddfe26`. Acceptance, Redo and project Save, Close, reload and Open produced 7,766.017 mm³ at revision `c97cea91a24d18dc`. The reopened right section shows the enclosed cavity. Browser grants were revoked after use and absent on fresh Open.
- **PASS, refusal and replay.** The browser rejected a numeric string, zero thickness, cavity collapse, an extra field, the wrong body, a stale revision and retired or consumed handles. The Model test rejects unavailable native topology, an unsupported rectangle and non-finite input before evaluation. The strict native report has one genus-zero solid with two closed shells.
- **PASS, affected checks.** 25 Model and 33 Studio tests, Model and Studio type checks, affected lint, production Studio build and whitespace. The passing desktop run had zero page errors, console errors and downloads.
- **FAIL, initial checks.** Three baseline driver attempts used a generated body label, an async handle without its value and unrounded API volume. The first Model type check assumed a boundary-edge property in the per-body topology report. The first candidate desktop run expected the stock key `b1` after acceptance. The existing Shell command assigns the output key `b2`. Corrected checks passed.
- **NOT_RUN.** Whole suites, external natural-language clients, deployment, mobile and the original L2 direct-edit policy acceptance. [D2211](../webmcp-module-reload-closeout-review-2026-11-28/README.md) records the remaining policy condition for #204. The first mechanical CAD baseline remains 8/10.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal shell-corner toolset
pnpm --dir apps/cad-studio test webmcp shell-opening-history tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/dist"
CAD_STUDIO_DIST="$OUT/dist" bash "$OUT/desktop.sh" "$OUT/final"
git diff --check
```
