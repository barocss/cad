# Terminal multi-Flange History owner navigation (#27 partial)

Baseline: e4359b68450ca1a93775c629641295974c393acf. Candidate: 7dc76f7fdad4cd950ac5c4e4912707fa64e2133d.

D121 synthetic rectangle/base + four corner reliefs + four terminal Flanges. Before: native four bends but no owner links. After: each exact n6/n7/n8/n9 opens its History owner; shared rule links open n1. Close preserves accepted document; independent native reevaluation is identical. Original screenshots, not composites. Native flat dimensions displayed 144.786 × 114.786 mm; no independent manufacturing allowance certification.

Validation: focused 29/29, new four-Flange actual, prior two-Flange actual, Studio tsc, Vite and scoped ESLint PASS. Context/browser/server closed, no downloads/errors/source changes.

Scope: contiguous rectangle/base, optional relief prefix, two or more terminal full-width numeric Flanges, exact typed owner/face bijection. No new editing admission. Unsupported branches, suppression, side/output mismatch, duplicate/mixed faces and downstream holes/cuts remain refused. 3/7-Flange and variable relief counts are guard-only tests, not physical constructibility proof. Save/export, downstream, radius editing NOT_RUN/not expanded. #27 remains open.

Before first baseline execution, malformed fixture text replacement failed node --check; corrected before browser launch. No product runtime failure in this pass. Native/Model code unchanged; Model full suite not rerun.

Runner relative paths assume this folder is apps/cad-studio/handover/notes/terminal-flange-chain-2026-11-20. Set existing PW_DIR, CHROME and CAD27_OWNER_FROZEN=1; run node actual-browser.mjs OUTPUT under sole heavy gate. No installs or downloads.
