# Reopen and edit an inherited sheet Flange after a source Depth change (#20)

This is a regression check on `6fb8ac08f60acd29671eb377739c51bad7d1edc8`, not a product change. A synthetic 80 × 50 mm sheet (1.5 mm thick, K = 0.44) has an inherited-radius, terminal x-max Flange. In actual Chrome, changing source Depth from 50 to 60 mm updated the Flange's edge signature (identity, position, direction, length) to `n1.side1|n1.top`, `[80,30,1.5]`, `[0,1,0]`, 60 mm.

1. Save and close in the browser's private project storage, reload the app, and explicitly open the saved project file. [First reopen](11-depth60-length20-reopened.png) shows bounds of 80 × 60 × 20 mm.
2. Keep that file attached and change only Flange Length from 20 to 24 mm in History. The repaired edge signature, original operation, and inherited inner/outer bend radii (1.5/3 mm) stay the same; no hold or radius override is introduced. Native volume rises from 8778.08625617599 to 9138.086256175982 mm³, matching the expected 360 mm³ increase. One Undo/Redo restores each exact stored model and its native geometry.
3. Save, close, reload, and explicitly open the same saved file again. [Second reopen](15-depth60-length24-fresh-reopen.png) shows bounds of 80 × 60 × 24 mm. Saved bytes and native geometry match the accepted 24 mm state.

An earlier harness attempt detached the project after the first reopen. The resulting same-name Save refusal was correct protection, not a persistence defect. No downloaded files or restored autosaves were used in the successful run. This checks one full-width x-max Flange and does not qualify other recovery families.
