# #678: exact assembly copy target

Baseline at c75cb919: `assembly add_part copy_of=p1/missing` returned changed success and copied host p1 despite no such occurrence. Actual returned document opened in Studio and rendered the unwanted Copy.

Fix limits partCopy to exact base or top-level ID. Shared mate occurrence lookup is unchanged. Nested copy is not introduced. Original documents remain unchanged on refusal.

Validation: 32/32 focused copy/route-admission/nested-references/nested-face-repair tests; changed-file lint PASS. Actual Chrome frozen run PASS: missing target refused, ordinary direct/base copies retained their source nodes and native Save/Open roundtrip. Screenshots reviewed. All contexts/browser/server closed; source unchanged. This qualifies dispatcher output consumption, not a direct UI copy command.

- baseline.png: unwanted host copy
- fixed.png: unchanged document after refusal
- direct.png: direct copy reopened
- base.png: base copy reopened
