# Casual Studio

A small, separate entry point for the [#749](https://github.com/barocss/cad/issues/749) workflows: adapt a cable guide, fit a wider sensor board, or open a self-centering vise without shifting its center.

```sh
pnpm dev:casual
pnpm build:casual
pnpm --filter @barocss/casual-studio-app type-check
pnpm --filter @barocss/casual-studio-app test
```

From the start screen, choose the cable-guide, sensor enclosure, or vise example, start with code, or open a supported native file. The cable-guide example opens the same recipe editor as the blank-code path, with the code panel closed. Pick hole A or B on the 60 × 40 × 5 mm plate, enter a diameter and preview before applying. Edits can be exported to `.bcad` or saved as a recipe. Resetting a diameter to its example default is also a preview, not an immediate change.

**Sensor board enclosure.** On the start screen, choose **센서 케이스 열기**. Preview 56–64 mm of board width in the assembled, interior, or exploded view. Hover or focus a change row to emphasize the corresponding geometry. When the applied width differs from 56 mm, **기본값 56 mm로** previews the default without replacing an existing draft; applying it is one undoable edit. Save the applied width as a sensor recipe or export a BCAD whose Variants input continues to drive all four dependent dimensions. [Preview and reproduction](examples/sensor-enclosure/README.md).

**Self-centering vise.** Pick a jaw to edit its grip height alone, or choose the gap to move both jaws around a fixed center. The base and its mounting holes are inspect-only in this example. [Desktop workflow and native file](examples/centering-vise/README.md).

**Rover assembly review.** Choose **로버 조립 보기** to rotate the 25-part model, switch between assembled and exploded views, or follow four assembly steps. The viewer highlights only the parts added at the selected step and leaves the original placements intact. **원본 CAD 받기** downloads the unchanged, editable Studio file. [Desktop captures](examples/rover-assembly/README.md).

**Existing native file:** the bounded native import editor keeps the original feature graph and opens the optional one-line diameter editor on request. It does not generate a recipe from the file.

**Create from code:** choose **코드로 만들기** for a blank document. Enter a version 1 recipe, preview, then apply. A recipe defines one rectangle/extrusion and up to eight vertical through-holes. Open and save the executable text as `.cadrecipe`, or export the applied native features as `.bcad`. Radius derived from a recipe diameter is exported as its current value; the source relation remains in the recipe. See the [working syntax example](PRODUCT.md#코드는-모델-전체를-정의할-수-있어야-한다).

**Deliberate limits.** Existing `.bcad` import still accepts the bounded two-hole shape, not every recipe export; keep the corresponding recipe to reopen the source in Casual. Unsupported native files are not rewritten and may be opened in CAD Studio. Recipe hole diameter declarations are editable from the canvas; fixed literals are not. Arbitrary code execution and general import remain out of scope. App-local undo is not carried by the native file. The editing examples have fixed viewport presets. The rover has a desktop review-only orbit; no geometry edits, motion, or general assembly authoring.

See the [product plan](PRODUCT.md) and the [roadmap](ROADMAP.md) for the next use cases and their acceptance checks.

## Verification

The core tests measure native rim samples independently of the editable fields, check target isolation and stale edit rejection, and round-trip native serialization with shared Centre Y. The browser script uses a fresh context against the actual production build and checks visible wall and rim picks, prepare/cancel/apply/Undo/Redo, invalid sizing, optional code, and save plus fresh reopen. It also checks the starter on desktop and a narrow viewport, pending edit protection, a genuinely blank recipe, invalid input and stale preview rejection, source save/reopen, and a separate CAD Studio edit of the exported three-hole plate. It requires Playwright and a local compatible Chromium:

```sh
cd apps/casual-studio
DESKTOP_ONLY=1 PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chromium node test/browser.mjs
```

Build Studio from the same checkout with `pnpm build` and set `CHECK_STUDIO=1` to also exercise the real Studio feature editor and round trip, including opening the applied 64 mm sensor export and rebuilding it to 56 mm in Studio, and reopening the untouched rover file with all 24 placed components and its saved steps.

The landing page and first native import preview load no Studio shell, worker, WASM or recipe compiler in the tested build. The example and blank-code entry load the recipe compiler on demand. The shared evaluator and native format reader are still part of startup.

[Desktop selection and preview](casual-context-desktop.png) · [390 px touch selection and preview](casual-context-mobile.png)

![Actual Chromium capture of the contextual diameter preview](casual-context-desktop.png)

![Actual Chromium capture of the Casual Studio start screen](casual-start-chrome.png)

![Actual Chromium capture of a plate authored from a blank recipe](casual-recipe-chrome.png)
