# D1602 — Cut one straight span of a construction polyline

P1, row 09, [#226](https://github.com/barocss/cad/issues/226). Base `c703871a1e3f2ccdc5b16e3f7b9f17f6c1c7554e`.

Trim now offers Cut polyline gap for one visible, open, unconstrained construction chain made of straight spans. The nearest span must be unique and the whole gap must fit inside it. The command splits the chain into two ordinary open construction shapes. It keeps all old points, IDs and adjoining spans and gives the two cut ends new IDs.

- **FAIL, base capability by source inspection.** The previous command only admitted a line or arc with two points, or a circle. It offered no gap command for the four-point polyline.
- **PASS, desktop Studio WebGPU.** Use a 30 mm diagonal between two 4 mm adjoining spans. Hide the construction to make the input unavailable. Refuse the corner-spanning cut, preview a 4 mm gap and cancel without changing the accepted sketch. Apply once and keep both adjoining spans. Undo and Redo, extrude the separate stock rectangle 2 mm, Save to the browser project, reload and Open. Re-enter the source sketch through the reopened Extrude. Both construction paths are visible with the same open ends. The original two-point line operation also passes the same geometry flow.
- **PASS, independent geometry.** The ideal endpoints are (30.4, 27.8) and (33.6, 30.2) mm. The actual pointer yields (30.399997, 27.799998) and (33.599997, 30.199998) mm. The stored length is 4.0000000000000036 mm. Each remainder has 17 mm within 1e−5 mm. Original IDs e5 through e8 survive. The cut uses e9 and e10. The separate 5 × 5 × 2 mm solid remains valid at 50 mm³. The saved file has 1701 bytes and SHA-256 `22c5fa610c409a51f22f386e4e8d79f8095a616fe2907a25ca12dc51d05e04ad`.
- **PASS, affected checks.** 40 Studio tests, Studio types and build, scoped lint, driver syntax and Git diff. The final polyline run covered 1159 frozen files, with zero changed files, page errors and console errors.
- **FAIL, corrected harness attempts.** Lint found an unused driver binding. Type check found that the new plan variant needed the existing `bulges` field. The first desktop driver waited for a same-ID File Open during editing and retained the current sketch after a timeout. The final milestone checks Cancel and the actual project Open after Finish. A later driver used a 3e−6 mm pointer target tolerance and tried to open a source-only History tile after Extrude combined it with its feature. The final driver uses the existing 1e−5 mm stored-path tolerance for projected pointer placement and opens the sketch through the Extrude History tile.
- **NOT_RUN.** Same-ID File Open during active sketch editing after the initial failed attempt, other planes or renderers, mobile and full local suites. Ordinary multipoint material paths, curved chains and gaps across vertices are outside this milestone. #226 remains open.

Use Node 22.19.0, installed Chrome and Playwright. Gate each run and keep captures outside Git.

```sh
pnpm --dir apps/cad-studio test path-gap-preview arcPathGap linePathGap viewport sketch-draft-history
pnpm exec eslint apps/cad-studio/src/sketch/{pathGap,usePathGap}.ts apps/cad-studio/test/{line-path-gap-browser.mjs,path-gap-preview.test.ts}
pnpm --dir apps/cad-studio build
D1602_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$EVIDENCE/polyline" --polyline
D803_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$EVIDENCE/line" --geometry-only
node --check apps/cad-studio/test/line-path-gap-browser.mjs
git diff --check
```
