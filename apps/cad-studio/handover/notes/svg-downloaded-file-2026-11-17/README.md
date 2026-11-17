# #623 final downloaded SVG / fresh XML file gate

Parent: `61baaa8c2a133c833ab16d4e397b3398a1afde3c`. **Test/evidence only. No product source change, build, native recalculation suite or package installation.** The existing writer fix is [9d309c3b6](https://github.com/barocss/cad/commit/9d309c3b67109b7f45bc7edf06dee89a08a5bb78); its [prior bounded evidence](../svg-xml-characters-2026-11-16/README.md) was Blob/anchor interception, not actual download.

## Final actual02 PASS

Original run: `/tmp/cad-svg-download-02`, log `/tmp/cad-svg-download-02-run.log`. A synthetic ordinary 32×24×8 mm box and one A3 current sheet use the public Drawing title and Export SVG controls. No anchor/Blob interception is installed.

1. Enter literal U+0001 in the title. Export gives **SVG not written**, no export confirmation and **zero browser downloads**. Exact accepted document, selection, dirty indicator and Undo/Redo button state remain unchanged by the refused export.
2. Dismiss the prior refusal and explicitly repair the title to `한글 Ø ± & < > " 😀`. Export triggers exactly one real Playwright Download. `download.saveAs` completes, `download.failure()` is null and the saved file is then read from disk.
3. The downloaded file is **4100 bytes**, SHA-256 `af1c0145ab9264303ed55f4882835ef1307aea582817c57531a6ec020d2c35c5`. `downloadedUnicode.svg` is an unchanged copy of those bytes, not a separately regenerated writer output.
4. A fresh Python process uses stdlib `ElementTree.parse(file)` to read that file. Exact title, SVG namespace, 420 mm × 297 mm physical units and `viewBox="0 0 420 297"` pass. Independent literal geometry checks measure four front lines spanning **32×8 mm** and four top lines spanning **32×24 mm**, matching the box at scale 1. No native evaluator was added for this oracle.
5. A **new browser context** opens the saved file with `file://`. It finds zero parser errors and exact SVG title/physical dimensions. This is a fresh browser file open, not Studio SVG import. Its DOM result is preserved in `fresh-browser-xml.json`.
6. Export and external-file inspection preserve the repaired accepted Studio document and UI state. All **530** frozen source files match before/after/after cleanup; page errors, console errors and watched changes are empty. XML context, Studio context, browser and server close successfully.

The original run paths, receipt/capsule/source hashes, parsed observations and first failure are in curated `receipt.json`; runtime/parser output is in `logs.txt`. Child and parent directly inspected both actual PNGs and synthetic SVG text: no personal information. The parent independently reran Python fresh parsing of the saved SVG and confirmed the fresh-browser JSON.

- [Invalid title refused, no download](01-invalid-no-download.png)
- [Repaired title and actual download](02-repaired-real-download.png)
- [Actual downloaded SVG bytes](downloadedUnicode.svg)
- [Independent file parser](independentparser.py)

The minimal fixture's missing overall-dimension guidance is visible in the Drawing UI; this export test does not claim a complete manufacturing drawing or resolve that advisory.

## First failure preserved

`/tmp/cad-svg-download-01` remains **FAIL**. Actual download, Python XML parse and fresh file-browser DOM assertions had passed, but an optional full-page screenshot of the file:// SVG timed out after fonts loaded. It was a file-page screenshot/harness failure, not a corrupt SVG or serializer failure. Cleanup completed normally. The final driver removes only that screenshot, retains fresh-browser DOM assertions and saves their JSON. The actual Studio screenshots provide the requested visible product evidence. No product source changed and the first run is not relabelled PASS.

## #623 bounded closure matrix

| Original condition | Prior evidence | This final file gate |
| --- | --- | --- |
| Reject forbidden controls, lone surrogates, U+FFFE/U+FFFF without text mutation | Writer fix 9d309c3b6, focused 5/5 and prior actual U+0001/U+FFFE | Actual U+0001 refusal, zero downloads, exact accepted state |
| Preserve valid whitespace, Korean, symbols, supplementary Unicode and delimiter escaping | Prior focused writer cases | Downloaded Korean/Ø/±/delimiters/emoji title parsed exactly by Python and fresh browser |
| Apply consistently to text/escaped attributes while preserving output geometry/scale | Prior writer attribute/input/ordinary-SVG tests | Actual saved A3 mm/viewBox and front/top literal geometry, accepted document unchanged |
| No successful/partial file delivery on refusal | Prior full-set eager writer refusal and Studio no-confirmation evidence | Zero download events on invalid title; one complete valid download only |
| Actual downloaded file opens independently | Previously NOT_RUN | **Now PASS:** saved file bytes → Python parse → fresh browser file open |
| No generic SVG-import, PDF/ASME or engine expansion | Prior scope exclusion | No product changes; all such scopes remain excluded |

This resolves the **last downloaded-file acceptance gate** in the existing #623 scope when combined with the prior evidence. Prior tests are cited historical results, not newly rerun tests. Issue closure/publication is the parent coordinator's decision.

## Known unrelated failures and exclusions

The previously recorded plain PDF hash failure and SVG/DXF units-golden drift remain unresolved. The follow-up [issue comment](https://github.com/barocss/cad/issues/623#issuecomment-6913907140) explicitly distinguishes these from ASME HOLD and does not label all drift a proven stale baseline. This task neither regenerates goldens nor claims they pass. No PDF investigation or build/test-suite repetition was performed. Generic SVG import, multi-sheet Studio downloads, other browsers, OS print, native-folder access and HOLD/WIP are not qualified or changed.

## Source custody and reproduction

Only `apps/cad-studio/test/svg-download-xml-browser.mjs` plus this evidence folder are new. Existing `svg-invalid-text-browser.mjs` and shared `flow-helper.mjs` are unchanged. The driver explicitly aliases `@barocss/cad-model/io/svg` to the **current checkout's** `packages/barocss-cad-model/src/io/svg.ts`, whose SHA is recorded and included in the frozen capsule. Native export aliases are read from this checkout's native package manifest, avoiding the earlier protected-worktree workspace-link mistake. The capsule is Studio TS/TSX/CSS plus driver/helper/config and explicit SVG writer; it is not a claim to hash every native dependency.

Node22 syntax and targeted ESLint passed:

```sh
# cwd apps/cad-studio
node --check test/svg-download-xml-browser.mjs
pnpm exec eslint test/svg-download-xml-browser.mjs
```

After stopping source writers, use a fresh output directory and the shared gate:

```sh
export PW_DIR="$HOME/.cache/barocss-playwright"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export SVG_DOWNLOAD_FROZEN=1
G="$HOME/.claude/local-mods/barocss-lanes-guard/bin/gate.sh"
"$G" acquire heavy 120 cad-svg-download02 || exit $?
trap '"$G" release heavy cad-svg-download02' EXIT
node test/svg-download-xml-browser.mjs /tmp/cad-svg-download-02
```

Independent fresh-file replay (no browser/native engine required):

```sh
python3 independentparser.py downloadedUnicode.svg '한글 Ø ± & < > " 😀'
```

The browser uses temporary headless downloads, not the native-folder project feature. All execution cleanup is complete; no commit/push performed by the worker.
