# Four-view review of a pending worker attempt

[#324](https://github.com/barocss/cad/issues/324) builds on the [working-document review](../agent-review-part-2026-11-20/README.md). A worker can propose the same geometry again after an earlier attempt expires. A model revision and an image checksum alone cannot distinguish those attempts.

## Agent workflow

Export a pending review receipt and use the new [candidate command](../../../../library-docs/docs/agent/cli.md#review-a-pending-worker-candidate). The CLI and the local Studio service read the accepted baseline and reconstruct the candidate with the existing task verifier. The renderer receives the changed occurrence in local coordinates. Each response includes the run, task, attempt, candidate digest, occurrence, model revision, four-view legend, raw PNG checksum, native dimensions and checks. The run must still contain the same review when the render returns. Rendering does not take a writer lock or issue an approval token.

The public CLI on the original main commit, 75ff9b9fa62e9de49ba582f8643d364f77116629, produced zero stdout bytes and a usage error for render-candidate. With the new command, two live CLI attempts returned the same 27,290 PNG bytes and revision 2846a2978b8f7000, with distinct attempts 1:1:base and 3:8:base. Rendering from the expired receipt returned zero stdout bytes and a nonzero exit. Every file in the run directory was compared before and after each read. The accepted commit count stayed zero.

The proposed plate measured 20 × 10 × 6 mm, with volume 1,200 mm³ and centroid (10, 5, 3) mm. Its PNG matched a separate MCP render of an independently edited 6 mm plate, and differed from the accepted 5 mm plate. Its PNG also matched the earlier 40 × 20 × 12 mm plate because the views fit the part to the frame. The top-view scales were 0.0450 and 0.0901 mm/px. This observed pair explains why a client needs both dimensions and attempt identity.

## Actual Studio result

The desktop flow used local Chrome, the real task-run service and MCP, and a scripted chat client. Playwright held the successful HTTP response for attempt 2:1:p1. The local host expired its finite lease and refreshed the same proposed edit. Studio loaded attempt 3:8:p1 and displayed its four-view image. The browser then received and parsed the old response. Two animation frames later the exact image URL, decoded 1000 × 1000 pixels, review text and approval controls still belonged to B. Run record bytes and the original saved model stayed unchanged.

One controlled invalid reply tested failure and retry. The old image disappeared. A successful retry restored B's image. Explicit Studio approval sent B's attempt ID and created one commit in the task run. The saved baseline stayed byte-identical. All 1,393 pinned sources matched through cleanup. No generated screenshots, transcripts or run objects are stored in Git.

**PASS** — desktop stale delivery, retry and approval; real CLI image and stale refusal; native checks; Node 22.19.0 focused tests, Studio type check and production build. Affected lint reported six existing warnings in chatServer and zero errors.

**FAIL during qualification** — initial fixture types failed compilation. The original macOS scripted launcher died with a long argument before executing the fixture. The driver now runs its recording wrapper and fixture in one Node process. An intermediate run compared a temporary-directory symlink with its canonical path. The driver now uses the canonical run root. The final desktop flow passed.

**NOT_RUN** — paid visual-model judgment, networked workers, arbitrary CAD feature families and whole CAD acceptance. The image read supports pending attempts admitted by the current local task verifier. The Studio check controlled delivery timing and one invalid reply; it used the real renderer for A, B and the retry.

## Commands

Use the shared heavy gate for each run. Set PW_DIR and CHROME to the existing desktop installations. Supply a fresh absolute external directory for STUDIO_OUT.

```sh
pnpm --filter @barocss/cad-studio-app test task-run-candidate-render.test task-candidate-image task-run-cli.test
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
CANDIDATE_RENDER_SOURCE_FROZEN=1 node test/task-plan-agent-browser.mjs "$STUDIO_OUT" --candidate-render
```
