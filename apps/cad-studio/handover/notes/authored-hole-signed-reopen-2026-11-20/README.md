# Author a Hole on the last Linear copy, reverse spacing and reopen (#25)

The earlier signed-spacing fixture started with the Hole in the file. This desktop Studio check starts with only the stock and its Linear pattern. The test picks the top face of copy 3 on the canvas and creates the 2 mm diameter through Hole in the HUD.

- **PASS, authorship and history.** The real pick at [84,13,8] produced entry face `n1.top@2`. History rejected spacing 0 without changing the model or Undo/Redo availability. With spacing −16 mm the same face carried the Hole at [20,13]. Undo restored +16 mm. Redo restored −16 mm.
- **PASS, persistence and geometry.** Browser Project Save, Close, page reload and explicit Open restored the negative-spacing document exactly. Returning to +16 mm restored the original authored document and Hole at [84,13]. The native checks found all 24 stock corners, both radius-1 cylinder walls and one extra loop only on the final copy's top face. The volume agreed with 576−8π mm³ within 1e−7 mm³.
- **Decision.** The current product passed this workflow. This test extends qualification of one X-axis pattern with three disjoint rectangular copies and a single terminal through Hole. Other #25 acceptance criteria remain open.

Set `LINEAR_AUTHORED_HOLE_SIGNED_SOURCE_FROZEN=1`, `PW_DIR` and `CHROME`. Run `node apps/cad-studio/test/linear-authored-hole-signed-browser.mjs <fresh external directory>`. The check uses a fresh browser context and browser-local project storage.
