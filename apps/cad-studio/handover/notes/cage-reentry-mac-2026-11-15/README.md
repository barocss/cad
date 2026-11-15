# D1330 — Preserve cage drafts on reentry (#563)

## Implementation

`subd/cageBeginPolicy.ts` classifies invalid targets as refuse, same node plus exact source identity as keep, and another/stale active session as refuse unless discard is explicit. `useCageEditor.begin` returns on keep without resetting session, selection, history, preview, depth or drag. Native modeling is unchanged.

App handles active cage commands before generic tool/workspace teardown. Same-cage entry merely closes the palette. Another cage uses existing Keep/Discard guard with current session identity; only approved, still-owned document/target proceeds to begin. Source change while the dialog is pending invalidates the request.

## Independent Mac verification

- New policy3/3 plus commit-readiness4/4 PASS: invalid, same source, changed source and explicit discard.
- Studio type-check, hook/helper focused lint, production build and diff check PASS. Existing App `_k` unused lint remains separate.
- Public two overlapping30×20×16 SubD boxes with4 subdivisions at1024×900 and1440×900: first draft Crease stays exact through three same-cage commands. Selecting the other body then Edit cage requires confirmation; Keep and Escape retain the first draft/selection/Undo/document.
- Explicit Discard starts the second cage with empty selection/history. Creasing and Done changes only the second authored node; first remains byte-equivalent to base. Document Undo/Redo and native Save/fresh Open PASS.
- Actual kept-draft screenshot visually reviewed. Browser uses Crease rather than the original4mm drag; same session identity protects both.
- Driver `test/cage-reentry-browser.mjs`, frozen receipt SHA256 `ad6869e45563287924748cef35788343ce6b6f12bf6b28ada0461979f7dfd245`.

## Limits / next

External document replacement during an open dialog, mobile/AT, other cage shapes and full suites NOT_RUN; policy/ownership inspection does not claim browser fault injection. CI not awaited and all HOLDs persist. Next D1331/#565: distinguish open SubD surface status and disclose STL boundary/target information before download without changing export geometry.
