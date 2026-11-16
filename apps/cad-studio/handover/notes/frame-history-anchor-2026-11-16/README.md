# Frame anchor creation/History parity (#28, partial)

Creation already supports eleven Line through anchors, but Frame/Frame member History had no anchor field. A pre-change regression test first confirms creation's choice and then fails on the absent History field. Private baseline: `/tmp/cad-frame-anchor-before.log`.

History now shares the same ANCHORS list: Lines through for a frame and Line through for one member. The setter checks current node kind and allowed value; it changes only the global anchor. Selecting centroid deletes the optional field, matching creation defaults. Section, offsets, roll, estimates and explicit member overrides remain intact. No section row replacement or inferred reference change is added.

## Verification

- Related Model tests 9/9, targeted lint and full Model TypeScript pass. Native frame checks verify that the global member moves while an explicit override member retains identical bounds, volume and mesh positions.
- Actual frozen Chrome `test/frame-anchor-history-browser.mjs`: Frame and Frame member each expose all eleven choices; Cancel retains the source, bottom-left applies, Undo/Redo and memory-file reopen retain it, and centroid restores the default.
- Independent Python checks for a 20×10 mm rectangular tube, 2 mm wall and 100 mm length: centroid bounds [-10,-5,0]–[10,5,100], bottom-left [0,0,0]–[20,10,100], volume (20×10−16×6)×100 = 10,400 mm³. Native bounds/volume and displayed worker volume agree. No physical downloads, browser errors or frozen-source changes. Screenshot inspected.
- Full Studio TypeScript and production build pass. Private receipt: `/tmp/cad-frame-anchor-browser-01`.

#28 remains open for section row replacement and other reported Frame/connector placement boundaries. Existing #126 WIP and HOLD scopes are unchanged.
