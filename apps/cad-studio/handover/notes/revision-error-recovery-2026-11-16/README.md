# Shared revision recovery completion audit (#38)

The remaining old-error concern is already handled by App's document-owned notices (`documentSource`, `noticeExpired`) and placed evaluation lane ownership. No extra product mutation was needed.

New frozen browser regression at 1024 and 1440:
- Two occurrences share an invalid zero-height Rev B. Both real placed-worker replies fail; a visible error exists.
- Accept valid Rev C while holding its first real placed-worker response (not replacing its result).
- Before releasing that response, both authored occurrences say Rev C and retain their exact color overrides; the old Rev B notice is absent.
- Release the response; both actual placed evaluations succeed. The error remains absent and both red cubes display. Save/Open preserves the recovered document.
- `recovery-pending-1024` and `recovered-1024` screenshots visually inspected. Output: `/tmp/cad-revision-recovery-20261116`.

Together with `46ffce7da` (deduplicated occurrence/body holds) and `601e2b3bd` (explicit held Reset), this covers #38's stated completion criteria. Those prior browser checks cover Keep Rev C, Undo/Redo, cross-instance isolation, and reset/reopen of hidden/color/material/face overrides. Their tests/build results are in the adjacent held-look notes. This commit is test/documentation only; no product code changed.

Limits: Chrome WebGPU only, not WebGL2, accessibility/IME, or arbitrary failing kernels. Two failing occurrences were both observed; the production evaluator processes them sequentially, not in simultaneous parallel execution. Protected #126 WIP remains unpublished.
