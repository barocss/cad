# Interference result scope (#40 partial)

Each native base-body check now records the keys it actually inspected. Its result lists all/selected base-body scope, body/pair counts, names, and hidden bodies included in the check. Selection changes do not relabel this report: visible copy says the result belongs to this check and must be rerun for a different selection. Fewer than two selected bodies still means all base bodies, now explicitly explained. The geometric checks, bounds skip, volume thresholds, and result ownership are unchanged.

Validation:
- Interference unit regressions: 4/4 PASS, including exact checked keys, hidden inclusion, disjoint selected pair, partial/error results, and retired replies.
- New Chrome WebGPU browser, 1024×900 and 1440×900: select C alone with hidden B; all A/B/C report includes hidden B and the real A∩B 500mm³ clash. Select A/C afterwards; previous all-body report stays explicitly scoped. Rerun reports selected A/C only, one pair, no overlap. Document unchanged. Screenshots inspected.
- Existing delayed real-Worker ownership browser: PASS through Close/Open, retirement and host disposal.
- Focused lint and diff whitespace: PASS. Production build verified separately before publication.

#40 remains open for its Print recalculation portion, which this non-manufacturing change does not address. No assembly occurrence interference or WebGL2 coverage, full aggregate browser suite, or kernel support expansion claimed. Protected #126 WIP is excluded.
