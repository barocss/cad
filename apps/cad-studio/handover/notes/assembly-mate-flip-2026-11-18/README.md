# #684: preserve explicit concentric mate direction in summary

Baseline ab41fd346: public add_mate stores flip:false and aligns the reversed pin axis to +Z; get_assembly drops the false field. Omission instead retains -Z, while true constrains -Z. Baseline actual Studio renders the +Z pin, then the expected summary-presence assertion fails.

Fix changes only concentric false output. Existing true/omitted and other mate summary JSON contracts remain unchanged; no solver or saved-data change. Focused 32/32 passes including public three-state creation, query immutability and summary-driven recreation with identical mates/placements, four other mate kinds, previous geometry summaries and nested references. Changed-file lint and Studio TypeScript pass; independent read-only review found no blocker.

Frozen actual Chrome passes all three states with native Save/Open exact document equality. Same-axis and opposite-axis images show the existing correct Studio geometry; the changed summary field is recorded in receipt.json. This is not a UI or dynamics feature. Six contexts/browser/server closed; source unchanged during run. Baseline and fixed initial view plus reopened same-axis evidence retained.
