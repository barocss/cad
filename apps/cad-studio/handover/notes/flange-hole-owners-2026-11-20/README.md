# Flange History ownership through a qualified Hole suffix (#27 partial)

Baseline: 7dc76f7fdad4cd950ac5c4e4912707fa64e2133d. Candidate: da40a3087a73a345db73866bd5f873aa5b9b67f1.

Actual D121 first 11 nodes: rectangle/base, four corner reliefs, four Flanges, one default XY through Hole at (12,12), radius1.6. Before: native four typed owners preserved but no History links. After: n6/n7/n8/n9 each opens exact History; rule link opens n1. Close preserves accepted document, independent native reevaluation identical. Original unmodified synthetic screenshots, no private content.

Native oracle: strict valid BRep; bore cylinders c.xy=(12,12), axisZ, radius1.6, inward; split count not assumed. Removed volume12.063715789779963 versus pi*1.6^2*1.5=12.063715789784807 mm3; flat area removed8.04247719319028 versus pi*1.6^2 mm2. Four typed owners and exact flat face sets remain unchanged. This proves base cut for this fixture only, not general base-only classification.

Admitted navigation: qualified plate chain, two or more full-width Flanges, optional sequential numeric through-Hole suffix with omitted or Z axis. Current native face bijection and source/generation guards remain mandatory. Named face, depth, other axis, side, countersink, pattern/thread/binding, unknown metadata, phase reentry, branch/side/output mismatch remain refused. No kernel or editing-admission changes.

Verification: focused34/34; one-Hole actual; existing four-Flange and two-Flange actual; Studio tsc, Vite, scoped ESLint and diff-check PASS. All contexts/browsers/servers closed. No errors, downloads or source changes.

Limits: four-Hole suffix is synthetic guard coverage only. No actual four-Hole run, Save/export, radius editing, arbitrary downstream cut/slot/transform or manufacturing qualification. No independent flat-circle center oracle. Native/Model full suite not rerun (unchanged code). #27 remains open.

Fixture preparation corrections before execution: writer replacement argument error fixed before file generation; whole injected-doc equality narrowed to exact nodes/outputs/parameters with accepted document retained, respecting reader normalization. Final baseline additionally records mass method; no assertion change. No runtime FAIL in this checkpoint.

Portable runner paths assume apps/cad-studio/handover/notes/flange-hole-owners-2026-11-20. Set existing PW_DIR, CHROME, CAD27_OWNER_FROZEN=1; node actual-browser.mjs OUTPUT under exclusive heavy gate. Use baseline runner with baseline code. No installs or downloads.
