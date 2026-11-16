# Pipe radius boundary guidance (#32 partial)

Verified the reported circular-profile boundary: radius-5 section with two 8 mm runs and a 90° +X bend rejects bend radius 4.99 mm but accepts 5 and 5.01 mm. The existing revolve kernel supports axis contact at profile vertices, so the previous blanket requirement for a radius strictly larger than section reach was misleading.

Changed diagnostic text only: prohibit crossing the axis / contact between profile vertices, while explaining that vertex contact may be supported. The friendly mapper still recognizes the legacy kernel message. Geometry acceptance and the separate exact arc Sweep restriction are unchanged; this is not a general promise that all profiles accept equal radius.

Verification: model boundary test 1/1 PASS; focused lint and Studio TypeScript/Vite build PASS. Browser `test/pipe-radius-browser.mjs` PASS at 1024/1440 in Chrome WebGPU: 4.99 refuses with the corrected guidance and disabled Apply, Enter keeps the sketch unchanged, 5 recovers to preview and applies, Undo/Redo and Save/Open pass. Refusal screenshot reviewed. Results `/tmp/cad-pipe-radius-20261116`, build `/tmp/cad-pipe-radius-build.log`.

#32 stays OPEN for open-slot/floor diagnostics and Retaining ring preview framing. No full-suite, WebGL2, arbitrary profile, or exported boundary-quality certification. #126 protected WIP and existing HOLD scopes untouched.
