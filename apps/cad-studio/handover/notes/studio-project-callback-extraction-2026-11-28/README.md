# D2234 — Extract Studio project document callbacks

P4 [row 12](../../roadmap-rows/12.md) and [row 21](../../roadmap-rows/21.md) · Base `600f8a3a2`.

`createStudioProjectCallbacks` owns project Open admission, Restore validation, linked-part notices and the accepted-document fit callback. Studio App supplies the current document owner and engine. The existing project hook handles the files and version history. App goes from 2,234 to 2,211 lines.

- **PASS, actual desktop before and after.** Chrome with WebGPU compared saved and working versions, restored a 6 mm extrusion, preserved the saved 8 mm file until explicit Save and reopened the 2,160 mm³ restored part. With the real branch-log write for A held at native close, Open B made B current. Releasing A's old write kept B's document, version selection and next Save target. All 18 paired states match on document, bodies, selection, history, dirty state, version labels, active path, comparison, overlay, branch and notices. The named Restore file SHA-256 also matches.
- **PASS, affected checks.** 42 Studio tests, Studio types, affected lint, production Studio build and whitespace. The tracked browser ownership driver passed after its update.
- **FAIL, first ownership driver.** The old Box hotkey fixture never opened the HUD. The driver now uses the Shapes rail's Box command, with the same source documents, write scheduler and assertions.
- **NOT_RUN.** External folder aliases, independent simultaneous storage writers, provider calls, mobile and full local suites. First mechanical CAD remains 8/10.

```sh
pnpm --dir apps/cad-studio test project-open-fit project-version-ownership storage-version-snapshot version-tools-mcp
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/restore"
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/compare" --compare --comparison-hook
D521_SOURCE_FROZEN=1 node apps/cad-studio/test/project-version-ownership-browser.mjs "$OUT/ownership" --case=branch-to-B --expect=fixed
git diff --check
```
