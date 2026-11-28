# D2225 — Open the original Extrude editor from its native corner

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `f3d265b7e`.

The Selection inspector offers Edit Extrude on one current native corner of an original straight rectangular extrusion. It uses the existing History editor and checks the same picked vertex, body and document when it opens. The operation edits the existing authored feature.

- **PASS, actual desktop.** The baseline pointed to the corner but only History opened the source editor. The revised entry opened the original 12 mm extrusion. Closing a 17 mm draft kept the original model and returned focus. Two vertices and the native corner of a translated body had no source edit action. Editing Distance to 16 mm kept the feature ID and original profile, moved the top to Z22.375 and produced a strict six-face solid of 12,800 mm³. Undo, Redo and project Save → Close → reload → Open passed. The reopened native corner opened the same editor at 16 mm.
- **PASS, affected checks.** 9 focused Studio tests, scoped lint, Studio types, production Studio build and whitespace.
- **NOT_RUN.** Other stock and feature ancestries, placed occurrences, full local suites, mobile and live models. #629 retains its wider acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline --baseline
bash "$OUT/desktop.sh" fixed fixed
pnpm --dir apps/cad-studio test vertex-pick-filter history-editor
git diff --check
```
