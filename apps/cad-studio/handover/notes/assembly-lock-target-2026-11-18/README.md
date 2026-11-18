# #679: exact Lock target admission

Baseline b4cd752: nested moving part causes null.rotation TypeError. A nested target p1/p1 succeeds while moving p2 from x=20 to x=120, violating where-they-stand semantics. Actual dispatcher output opened in Studio and rendered this wrong placement. Input source was unchanged.

Lock core admission now matches the existing facade: exact base/top-level IDs only. Shared nested face mate lookup is unchanged. Nested Lock is not added.

Validation: focused Lock, PG-8, nested-references/face-repair and instance-patterns 57/57; changed-file lint PASS. Actual frozen Chrome PASS: nested target refused without changing source; direct/base locks retain original placement and native Save/Open. Grounded swap and both-fixed refusal covered by unit tests. Screenshots reviewed, all contexts/browser/server closed, source unchanged. UI Lock controls and physics certification are not qualified here.

- baseline.png: wrong placement from accepted nested target
- fixed.png: original placement retained on refusal
- direct.png: direct Lock reopened
- base.png: base Lock reopened
