# Full-circle instance spacing

Baseline `e451aaaed`. Existing circular patterns store step angle and count (seed included). The UI previously required manual arithmetic when distributing fasteners around a full circle. Add an explicit **Space full circle** draft action: set angle to signed 360/count and preserve clockwise direction. Invalid count disables the action. No automatic coupling, new stored field, schema, Model API or kernel change. An empty/zero angle starts counterclockwise; manual partial angles remain supported.

## Verification

- Focused draft tests7/7 PASS, including counts2/3/7/64, clockwise direction and invalid/blank counts. Existing origin/custom direction/restore checks retained.
- Studio types, targeted lint and diff check PASS.
- Actual Chrome first run PASS: seed [30,0,0], four occurrences including seed at 90°; change to six including seed at -60°. Literal position expectations, stable occurrence IDs and shared source definition checked. Draft click and Cancel leave accepted document unchanged; blank/65 count disables spacing action. Apply, Undo/Redo, actual native Save download/fresh Open and subsequent manual -30° edit passed.
- Screenshot directly reviewed. Six cubes are visible; current panel shows count6, angle-60. No page/console errors or source changes during frozen run.

Scope: one seed and world-Z circular placement. No new full-circle persistent mode; changing count alone still preserves the authored angle until the user explicitly spaces again. Nested assemblies, mates, neutral exports and full professional-CAD parity NOT_RUN. Existing HOLDs remain.

Commands: `node apps/cad-studio/scripts/test.mjs instance-pattern-draft`; `node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json`; `PATTERN_FULL_CIRCLE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-full-circle-browser.mjs <artifact-dir>`.
