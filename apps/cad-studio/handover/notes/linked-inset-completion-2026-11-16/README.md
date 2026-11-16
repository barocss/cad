# Linked inset completion audit (#36)

Audited current source at efc87dc87299398cc9bcf26a735d79c21465e816. No duplicate product changes: existing fixes include 8d43f90a9 (linked distance History editing), 1ab50b292 (active linked distance), 1e0f30626 (replacement blockers), 3e114547b (applied distance distinction), acb316926 (body names), 8fee2c660/2817c115c (source-dependent failure/recovery focus), and earlier review focus fixes.

Fresh Chrome WebGPU runs all PASS:
- `linked-inset-face-eligibility-browser.mjs --active-link --narrow`: stored link distance distinguished from general Offset, no unusable re-link action, rounded-face recovery. `/tmp/cad-inset-audit-active-20261116`.
- `linked-inset-review-focus-browser.mjs --edit-inset-distance`: stored inset separate from extrusion distance, invalid edit refusal/recovery and persistence. `/tmp/cad-inset-audit-distance-20261116`.
- `--narrow-dock --automatic-refusal`: narrow face rejection with visible recovery focus. `/tmp/cad-inset-audit-focus-20261116`.
- `--before-extrude`: pre-extrusion replacement prerequisites exposed instead of inviting unsupported action. `/tmp/cad-inset-audit-preextrude-20261116`.
- `--source-dimension`: source height collapse refused, recovery and reopened result validated. `/tmp/cad-inset-audit-source-20261116`.
- `--narrow-dock`: visible initial Cancel focus and Escape return in scrolled narrow Dock. `/tmp/cad-inset-audit-cancel-20261116`.

All runs used their source-freeze flags D1205_SOURCE_FROZEN or D1204_SOURCE_FROZEN and the shared Playwright/Chrome environment. Active-link and automatic-refusal screenshots reviewed. `sketch-offset-readiness` unit regression 4/4 PASS. This commit adds verification documentation only; no fresh product build required. Preceding product commit's CI passed.

Coverage is focused, not a full suite or every historical scenario rerun. Prior issue evidence covers source/target delete protection and perforated outline/reference copying; these were not re-executed in this audit. IME, assistive technology and arbitrary geometries remain outside the completion claim. General Offset Enter has its separate tracked scope. #126 held WIP is preserved and not included.
