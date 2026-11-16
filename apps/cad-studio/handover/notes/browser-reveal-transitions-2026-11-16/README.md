# Browser reveal transition ownership (#266 completion)

Base: `e476902ba43cba6272137aaa674fe3cb388c9b57`. Test/record only; existing production ownership guards pass without modification.

## Actual Studio boundary proof

The reveal implementation has no asynchronous timer: it batches tree expansion, Browser mount and a request, then consumes that request in a layout effect. To exercise a genuinely pending boundary without introducing a production delay seam, the driver dispatches two real UI DOM events within one JavaScript task. This is controlled React batching stress, not a claim that two physical user clicks are simultaneous.

For each of **selection change, Escape, New part, Model file Open, Undo, Redo, and linked revision acceptance**, the driver records that the first reveal event has not yet called row focus before the second event. After React commits, both intercepted row-focus calls and actual `focusin` events are empty. Thus the result is pending-request cancellation, not an already completed reveal followed by another action. No canceled-request feedback appears in the document/selection cases.

Model Open uses the existing file input and its real change handler with a separately named same-ID fixture. It awaits the actual accepted replacement rather than assuming the synchronous event already loaded the file.

## Actual linked revision proof

- Existing Instance panel **New revision file** proposes Rev B through the real input handler. The same `sub1/p2` occurrence remains, with its leaf height changed from 10 to 12.
- In one task, reveal is followed by **Accept Rev B**. The old request cannot focus a same-ID row.
- A real placed Worker response is held, not synthesized or altered. While the accepted document is Rev B but the placed result is stale, a new explicit reveal refuses with the current-revision message and no row focus.
- Releasing that exact response allows the real nested read-only card to show 1200 mm³. Explicit retry focuses `sub1/p2` at Rev B and leaves the accepted document unchanged. The screenshot was visually reviewed.

## Results and limits

Actual Chrome WebGPU 1440×900: **PASS**. Seven pending-request transitions, stale-revision refusal and current-revision retry pass. No runtime/console errors, frozen-source changes or downloads. Driver syntax and diff checks pass. Previous two-size body/occurrence UI, actual OPFS roundtrip, 47 related tests, Studio typecheck/build and explicit scope limits remain the foundation; this test-only follow-up does not rerun the full suite/build.

First launch used the wrong working directory and never started a browser. The first actual run passed all cancellation/refusal cases but its completion wait incorrectly expected the first displayed host body's bounds to represent the taller second leaf; it timed out. The final run waits for the exact nested leaf's real read-only card instead, then verifies explicit focus at Rev B. No product fix was required.

Run from Studio after the normal heavy-run gate, with `PW_DIR`, `CHROME`:

```sh
BROWSER_REVEAL_TRANSITIONS_FROZEN=1 node test/browser-reveal-transitions-browser.mjs <output>
```

Together with the earlier base and occurrence deliveries, this fulfills #266's bounded current-Browser action and ownership contract. No general virtualized-tree performance, hidden-part visibility change, new nested viewport picking, native-folder or geometry claim follows. Existing WIP and every HOLD are preserved.
