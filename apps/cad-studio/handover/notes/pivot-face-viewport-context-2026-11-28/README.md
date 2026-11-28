# D2218 — Open Pivot face from its viewport selection

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `9f9a520e6`.

Right-click the selected face or fixed edge of a pair that the existing Pivot face command supports. Studio keeps both picks and offers the same command in the context menu. The check uses the current command document. A different hit still selects that hit alone. Section and Direct selection keep their existing routing.

- **PASS, actual desktop.** The baseline right-click cleared the fixed edge and omitted Pivot face. The revised Studio retained the pair on both the face and edge menus. Preview and Cancel kept the original. Right-clicking another edge selected it alone and omitted Pivot face. Applying 12° kept the native hinge `n1.side0|n1.top` at `(4, −3, 18)` to `(44, −3, 18)` mm. The lower wall moved in by 2.550678740 mm and the closed six-face solid measured 8,987.837102 mm³. The independent wedge formula and eight expected vertices agreed. Undo, Redo and project Save → Close → reload → Open passed.
- **PASS, affected checks.** 5 Model and 20 Studio focused tests. Scoped ESLint, Studio types and `git diff --check` passed.
- **FAIL, initial checks.** The first desktop driver reselected a retained pair and opened the stock editor. Another driver check used the menu label without its keyboard shortcut. The typed Fillet fixture initially lacked the new command document input. The corrected checks passed.
- **NOT_RUN.** Wider #629 operations, other stock for this context flow, mobile and full local suites. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/checks.sh"
bash "$OUT/desktop-checks.sh"
git diff --check
```
