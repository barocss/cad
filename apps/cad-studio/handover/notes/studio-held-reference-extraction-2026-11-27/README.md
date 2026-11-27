# D2062 — Extract Studio's held reference editor wiring

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md) · Behavior-preserving App extraction · Base `c43c60114669769f061fbb31ebe23800a04f6bc2`.

Move the Shell opening and Fillet/Chamfer reference editors' shared source checks, worker reads, downstream candidate refresh and inspector props to `useStudioHeldReferences`. Keep the document and workspace eligibility rules in `App.tsx`. The Shell editor still requires its extra live context checks. Both editors commit explicitly through the same document callback and remember the new reference problems only after acceptance. `App.tsx` drops from 2,475 to 2,444 lines.

- **PASS, actual desktop Shell.** A face on the 2,304 mm³ companion block is refused. Only the selected 360 mm² opening face on the Shell is highlighted. Cancel, reselection and Apply preserve the companion solid. The downstream Chamfer receives a refreshed candidate and requires a second explicit confirmation. Both changes remain undoable and redoable. Native Save and fresh Open preserve both solids and the references.
- **PASS, actual desktop Fillet.** The two held slots reject a companion edge and a duplicate selection. Preview and Cancel preserve both solids. Applying two distinct edges recovers the R2 round. The 500 mm³ companion retains the same strict native geometry. Undo/Redo and native Save/fresh Open retain the corresponding references and geometry.
- **PASS, feature checks.** Focused Studio 29/29, scoped ESLint, Studio type check, Studio production build and diff check.
- **NOT_RUN.** Full local suites and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD completion is unmeasured.

```sh
# Node 22.19.0. Use the existing local desktop Chrome and Playwright.
# Gate the flows sequentially and keep files outside the checkout.
D2001_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/held-shell-face-pick-browser.mjs "$OUT/shell" --multi
D2051_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/fillet" --companion
pnpm --dir apps/cad-studio test held-shell-face-replacement held-shell-candidate-preview held-finish-replacement held-fillet-box-companion reference-decisions
eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/useStudioHeldReferences.ts
# TypeScript 5.9.2
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

Both source-frozen desktop runs recorded zero page or console errors. Shell receipt SHA-256 is `d6aae32b7ad535f7ea26ddfa9639ce42b8203f1e99728555a0b3e937086b00f8`. Fillet receipt SHA-256 is `64e2d00bfac081af85b1ffce9ff8ee35c10d23bace12b340d6aa2fea00505b62`.
