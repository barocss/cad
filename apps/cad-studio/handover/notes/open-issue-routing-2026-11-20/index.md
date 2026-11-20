# Open issues by primary route

[Priorities and counting method](README.md)

### P0 — Protect work, identity and output

- [#2](https://github.com/barocss/cad/issues/2) cad(contract): robust predicate and tolerance v1
- [#3](https://github.com/barocss/cad/issues/3) cad(feature): topology evolution receipt for native Split
- [#4](https://github.com/barocss/cad/issues/4) cad(feature): persistent face reference resolution v1
- [#5](https://github.com/barocss/cad/issues/5) cad(feature): transactional mixed-feature rebuild v1
- [#20](https://github.com/barocss/cad/issues/20) CAD Studio: 참조 변경을 확정하기 전에 다른 면·모서리에 피처가 적용됨 — `bug, ui/ux`
- [#168](https://github.com/barocss/cad/issues/168) epic(cad): canonical native modelling specification — `enhancement`
- [#170](https://github.com/barocss/cad/issues/170) epic(cad): documents and modelling history — `enhancement`
- [#181](https://github.com/barocss/cad/issues/181) epic(cad): product reliability and measured performance — `enhancement`
- [#196](https://github.com/barocss/cad/issues/196) fix(gpu): release resources when Viewer initialization rejects — `bug, high-priority`
- [#197](https://github.com/barocss/cad/issues/197) fix(gpu): bound disposed image-texture retention during repeated replacement
- [#279](https://github.com/barocss/cad/issues/279) fix(cad): STL Float32 변환으로 붕괴한 삼각형의 출력 거부와 오류 전달
- [#306](https://github.com/barocss/cad/issues/306) design(cad): CAD 갤러리 16 — Import Units·Export Loss·Refusal
- [#308](https://github.com/barocss/cad/issues/308) design(cad): Gallery 35 — containment, cut connectivity and dependency repair
- [#620](https://github.com/barocss/cad/issues/620) CAD Studio: 최신 Save 뒤 오래된 자동저장본을 미저장 작업으로 복구 제안
- [#621](https://github.com/barocss/cad/issues/621) CAD Studio: 다중 탭 Save 경합에서 완료된 저장을 늦은 쓰기가 덮어씀

### P1 — Sketch and edit a useful part

- [#21](https://github.com/barocss/cad/issues/21) CAD Studio Sketch: 직접 치수·구속 편집과 충돌 대상 복구 — `bug, ui/ux`
- [#25](https://github.com/barocss/cad/issues/25) CAD Studio: 패턴 핸들·Count·원본 절삭 선택을 생성과 이력에서 일치 — `bug, ui/ux`
- [#171](https://github.com/barocss/cad/issues/171) epic(cad): planar sketch and profile tools — `enhancement`
- [#172](https://github.com/barocss/cad/issues/172) epic(cad): sketch dimensions and geometric constraints — `enhancement`
- [#173](https://github.com/barocss/cad/issues/173) epic(cad): parameters and editable feature graph — `enhancement`
- [#174](https://github.com/barocss/cad/issues/174) epic(cad): core parametric part features — `enhancement`
- [#183](https://github.com/barocss/cad/issues/183) feat(cad): bounded coincident horizontal vertical and fixed sketch constraints — `enhancement, blocked`
- [#184](https://github.com/barocss/cad/issues/184) feat(cad,example): editable extrusion feature tree and dependency recomputation — `enhancement, blocked`
- [#187](https://github.com/barocss/cad/issues/187) feat(gpu): render complete native integer-box Boolean results
- [#190](https://github.com/barocss/cad/issues/190) feat(cad): partition a qualified Body into conserved closed Solids for Split Body
- [#198](https://github.com/barocss/cad/issues/198) research(cad): 판금 rigid Move·Mirror·Pattern 뒤 규칙·전개도·후속 flange 보존 계약
- [#203](https://github.com/barocss/cad/issues/203) research(cad): Forge 2.0 참고 — 치수 핸들·이력 재생성의 전체 preview 승인과 마지막 정상 상태 검증
- [#214](https://github.com/barocss/cad/issues/214) feat(cad-studio): 엣지 기준 원형 필렛 핸들과 시점 정렬 없는 거리 드래그
- [#216](https://github.com/barocss/cad/issues/216) research(cad): FreeShape 참고 — 선택한 세 꼭짓점의 작업평면 snapshot과 Sketch 시작
- [#221](https://github.com/barocss/cad/issues/221) research(cad): Fusion silhouette 참고 — body 투영의 닫힌 sketch profile과 관통·포켓 구분
- [#222](https://github.com/barocss/cad/issues/222) research(cad): IronCAD 참고 — 목표 평면 face에 연관된 Extrude 종료 조건
- [#223](https://github.com/barocss/cad/issues/223) research(cad): Kapy 참고 — 선형 sketch 복사본의 구속 참조와 개수 변경 계약
- [#226](https://github.com/barocss/cad/issues/226) research(cad): QCAD Break out Gap 참고 — 경로 길이 절단과 열린 결과 보존
- [#228](https://github.com/barocss/cad/issues/228) research(cad): Plasticity 26.2 참고 — 직선 edge와 sketch 평면의 교점 스냅
- [#229](https://github.com/barocss/cad/issues/229) feat(cad-studio): 두 기준점의 거리·비율로 계산한 임시 스냅
- [#230](https://github.com/barocss/cad/issues/230) research(cad): Dune 3D 참고 — 구속을 늘리지 않는 영구 스케치 참조 치수
- [#233](https://github.com/barocss/cad/issues/233) research(cad): DraftSight PowerTrim 참고 — 드래그 다중 절단과 전체 스케치 취소·Undo
- [#259](https://github.com/barocss/cad/issues/259) research(cad): IronCAD 2027 참고 — 회전 프로파일의 축 기준 지름 치수와 편집·저장 의미
- [#261](https://github.com/barocss/cad/issues/261) research(cad): Inventor 참고 — 구멍 반지름이 바뀌어도 유지되는 테두리–원주 간격 치수
- [#281](https://github.com/barocss/cad/issues/281) research(cad): FreeCAD 참고 — 공통 끝점의 선–원호 직교 구속과 저장 호환 계약
- [#292](https://github.com/barocss/cad/issues/292) feat(loader): ingest complete knot-recipe Loft graph and update receipts
- [#293](https://github.com/barocss/cad/issues/293) feat(loader): ingest complete-source Surface axis degree elevation receipts
- [#294](https://github.com/barocss/cad/issues/294) feat(loader): read complete saved native IGES import results
- [#295](https://github.com/barocss/cad/issues/295) feat(loader): read complete saved Convex Planar Face extrusion results
- [#296](https://github.com/barocss/cad/issues/296) feat(cad-editor): author conserved Solid splits with Undo and native files
- [#297](https://github.com/barocss/cad/issues/297) feat(loader): read complete saved Line width extrusion graph and update receipts
- [#298](https://github.com/barocss/cad/issues/298) feat(loader): read complete saved rectangular Face extrusion material Body results
- [#299](https://github.com/barocss/cad/issues/299) feat(loader): read complete saved Line width material Body graph and update receipts
- [#300](https://github.com/barocss/cad/issues/300) feat(loader): read complete saved paired roof-difference Body results
- [#301](https://github.com/barocss/cad/issues/301) feat(cad-editor): gated extrusion preview acceptance integration
- [#302](https://github.com/barocss/cad/issues/302) feat(cad-editor): select model outputs into existing command context — `enhancement`
- [#303](https://github.com/barocss/cad/issues/303) design(cad): CAD 갤러리 11 — 구속 충돌·접선/대칭·Suppression
- [#309](https://github.com/barocss/cad/issues/309) design(cad): Gallery 41 — sketch layer visibility and transient grid snapping
- [#327](https://github.com/barocss/cad/issues/327) feat(example): workplane sketch lines, polylines and rectangle profiles — `enhancement, blocked`
- [#369](https://github.com/barocss/cad/issues/369) [Design Gallery 63] 볼트·너트·나사 모델링과 체결 단면 개념
- [#374](https://github.com/barocss/cad/issues/374) feat(cad-editor): preview an underside pocket and through-window — `enhancement, v3:running`

### P2 — Draw, measure and exchange

- [#16](https://github.com/barocss/cad/issues/16) cad(kernel): STEP exchange breadth: assemblies, AP242 colours and names, PMI subset, offset surfaces, vertex loops, seam holes
- [#35](https://github.com/barocss/cad/issues/35) CAD Studio Drawing: 공차 반올림과 H7 표 행·등급을 일치 — `bug, ui/ux`
- [#179](https://github.com/barocss/cad/issues/179) epic(cad): interchange and format adapters — `enhancement`
- [#180](https://github.com/barocss/cad/issues/180) epic(cad): measurement, properties and engineering drawings — `enhancement`
- [#199](https://github.com/barocss/cad/issues/199) research(cad): 판금 DXF의 절단·절곡·주석 역할과 bend/included angle 출력 계약
- [#202](https://github.com/barocss/cad/issues/202) research(cad): Autodesk Assistant 도면 자동화 참고 — 기존 도면 도구의 검토·재생성·SVG 전달 계약
- [#205](https://github.com/barocss/cad/issues/205) research(cad): Fusion 2026.10 참고 — STEP의 이름 있는 기준 좌표계 보존·손실 보고
- [#212](https://github.com/barocss/cad/issues/212) research(cad): Onshape edge-condition symbol 참고 — 모서리 요구·형상·검사 결과 분리와 도면 보존 계약
- [#219](https://github.com/barocss/cad/issues/219) research(cad): Onshape 참고 — 공통 원점 좌표 치수 그룹과 참조·배치 보존
- [#224](https://github.com/barocss/cad/issues/224) research(cad): Onshape virtual sharp 참고 — 도면의 연장 교점 치수와 두 edge 참조 보존
- [#225](https://github.com/barocss/cad/issues/225) research(cad): Onshape 검사 항목 참고 — 도면 치수 번호·revision·검사목록 연결 계약
- [#227](https://github.com/barocss/cad/issues/227) research(cad): Fusion revision 변경 표식의 시트·zone·수동값 보존 계약
- [#232](https://github.com/barocss/cad/issues/232) research(cad): Onshape 구멍 위치표 참고 — 구멍별 태그·공통 좌표계·표 연결
- [#234](https://github.com/barocss/cad/issues/234) research(cad): Onshape 참고 — 원본 원호 구간에 연결된 도면 호 길이 치수
- [#236](https://github.com/barocss/cad/issues/236) research(cad): Onshape 참고 — 원통 측면 실루엣에 연결된 실제 지름 치수
- [#237](https://github.com/barocss/cad/issues/237) research(cad): Onshape 참고 — 교차하는 도면 치수선의 선택적 공백과 표시 보존
- [#238](https://github.com/barocss/cad/issues/238) research(cad): Onshape 참고 — 두 원의 최소·최대 원주 간격을 유지하는 도면 치수
- [#240](https://github.com/barocss/cad/issues/240) research(cad): Onshape 참고 — 도면 치수보조선의 끝점별 표시와 참조 보존
- [#241](https://github.com/barocss/cad/issues/241) research(cad): Onshape 참고 — 참조와 측정값을 보존하는 도면 치수보조선 꺾기
- [#242](https://github.com/barocss/cad/issues/242) research(cad): Onshape reference for source-bound centerlines between concentric drawing arcs
- [#243](https://github.com/barocss/cad/issues/243) research(cad): Onshape 참고 — 선택한 구멍 행의 중심 연결선과 그룹 참조 보존
- [#244](https://github.com/barocss/cad/issues/244) research(cad): Onshape 참고 — 동심 원 경계의 방사 두께 치수와 원본 참조 보존
- [#245](https://github.com/barocss/cad/issues/245) research(cad): Fusion 참고 — 도면 지시선 Note의 원본 끝점 참조와 명시적 재연결
- [#246](https://github.com/barocss/cad/issues/246) research(cad): Onshape 참고 — 원본에 연결된 45° 모따기 길이·각도 복합 치수
- [#247](https://github.com/barocss/cad/issues/247) research(cad): Onshape 참고 — 단면 치수 글자 아래 해칭만 비우는 표시 계약
- [#248](https://github.com/barocss/cad/issues/248) research(cad): Fusion 참고 — 선형 치수 화살표의 끝점별 안·밖 배치와 편집 후 보존
- [#250](https://github.com/barocss/cad/issues/250) research(cad): Onshape 참고 — 원본 물성에 연결된 도면 질량중심 표시와 치수
- [#251](https://github.com/barocss/cad/issues/251) research(cad): Onshape 참고 — 실제 반지름을 보존하는 큰 원호의 축약 치수 표시
- [#268](https://github.com/barocss/cad/issues/268) fix(cad-studio): TopSolid 참고 — 화면을 향한 3D 주석 글자의 표시·클릭 영역 일치
- [#269](https://github.com/barocss/cad/issues/269) feat(cad): ARES Mechanical 참고 — 도면 지름 치수에 연결된 끼워맞춤 목록
- [#271](https://github.com/barocss/cad/issues/271) research(cad): CADMATE 참고 — 두 평행 직선 경계에 연결된 도면 중심선
- [#275](https://github.com/barocss/cad/issues/275) research(cad): MoI 참고 — 원본값을 바꾸지 않는 도면 분수 inch 표시 계약
- [#277](https://github.com/barocss/cad/issues/277) research(cad): NativeCAD v0.30.0 참고 — STEP cone 각도 단위의 명시적 수락·거부 계약
- [#366](https://github.com/barocss/cad/issues/366) [Design Gallery 28] 경계 상자 · 면적/체적 · 관성 기준축
- [#738](https://github.com/barocss/cad/issues/738) research(cad-studio): Draftwright 참고 — 도면 재생성에서 참조·공차 변경 검토

### P3 — Review static assemblies

- [#178](https://github.com/barocss/cad/issues/178) epic(cad): parts, instances and assemblies — `enhancement`
- [#200](https://github.com/barocss/cad/issues/200) research(cad): SolidCraft v0.26.0 — linked 속성 상속·검사 중단·reference scan·파일 호환 계약
- [#207](https://github.com/barocss/cad/issues/207) research(cad): Gunpla Step by Step 참고 — 단계별 조립 설명과 부품·시점 탐색
- [#274](https://github.com/barocss/cad/issues/274) research(cad): SharkCAD 17 참고 — 부품 메모의 BOM 집계·내보내기 보존 계약
- [#284](https://github.com/barocss/cad/issues/284) test(loader): replace displayed assembly part geometry with explicit native repairs

### P4 — Use Studio, Viewer and libraries

- [#18](https://github.com/barocss/cad/issues/18) cad(kernel): kernel throughput targets and a large-model benchmark (thousands of faces)
- [#29](https://github.com/barocss/cad/issues/29) CAD Studio: 직접 곡선·곡면의 선택 상태·복사·검사 정보 일치 — `bug, ui/ux`
- [#44](https://github.com/barocss/cad/issues/44) CAD Studio: 데스크톱 모델링 UX 수정 순서 — `ui/ux`
- [#169](https://github.com/barocss/cad/issues/169) epic(cad): workspace, view and selection — `enhancement`
- [#185](https://github.com/barocss/cad/issues/185) spec(gpu): prepare qualified Shell material bindings and atomic appearance
- [#186](https://github.com/barocss/cad/issues/186) feat(gpu): query original source1 object identity at a rendered screen pixel
- [#188](https://github.com/barocss/cad/issues/188) feat(gpu): render general engine scenes with shared indexed geometry resources
- [#189](https://github.com/barocss/cad/issues/189) feat(gpu): prepare explicit Source2 affine renderer and lifetime contract
- [#191](https://github.com/barocss/cad/issues/191) feat(cad): sample higher-degree Curves in complete mixed documents
- [#192](https://github.com/barocss/cad/issues/192) feat(gpu): prepare multiple original Surface WebGPU profile
- [#193](https://github.com/barocss/cad/issues/193) feat(gpu): mount native Surface UV01 WebGPU viewport
- [#194](https://github.com/barocss/cad/issues/194) feat(gpu): mount authored directional light WebGPU viewport
- [#195](https://github.com/barocss/cad/issues/195) feat(gpu): define safe same-canvas renderer-family handoff for Viewer
- [#218](https://github.com/barocss/cad/issues/218) research(cad-studio): Bitbybit Designer 참고 — 한 명령 단계 원본의 학습·문서 정합성
- [#220](https://github.com/barocss/cad/issues/220) research(cad): Zoo v1.5.4 참고 — 일반 Model 검토용 이름 있는 카메라·가시성 preset
- [#272](https://github.com/barocss/cad/issues/272) research(cad-studio): Tetra4D 참고 — 선택한 꼭짓점을 지나는 단면 평행 이동
- [#273](https://github.com/barocss/cad/issues/273) research(cad-studio): VariCAD 참고 — 원본 mesh의 세 점으로 계산한 참고 원 계측
- [#282](https://github.com/barocss/cad/issues/282) example(gpu,cad): explicit native point and tangent queries on accepted geometry — `enhancement, blocked`
- [#283](https://github.com/barocss/cad/issues/283) test(loader): install packed CAD and interop in an independent ESM consumer
- [#285](https://github.com/barocss/cad/issues/285) test(loader): inspect original Surface curvature beside an admitted Three preview
- [#286](https://github.com/barocss/cad/issues/286) test(loader): inspect original endpoint continuity beside Three Curve previews
- [#287](https://github.com/barocss/cad/issues/287) test(loader): inspect qualified closed patch incidence beside original Three Face previews
- [#288](https://github.com/barocss/cad/issues/288) test(loader): inspect original endpoint continuity in a Babylon Curve host
- [#289](https://github.com/barocss/cad/issues/289) test(loader): inspect original endpoint continuity in a Pixi3D Curve host
- [#290](https://github.com/barocss/cad/issues/290) example(viewer): inspect original Curve4 with separate dimensionless section UV
- [#291](https://github.com/barocss/cad/issues/291) example(gpu): consume complete-source knot-aligned Loft frames
- [#310](https://github.com/barocss/cad/issues/310) design(gpu): feature result gallery — target visuals, not engine captures
- [#372](https://github.com/barocss/cad/issues/372) research(studios): Unity Editor Foundations 참고 — 문맥형 Inspector·명령·포커스 UX 검증
- [#373](https://github.com/barocss/cad/issues/373) feat(gpu): mount native point-light WebGPU viewport — `v3:running`

### P5 — Extend geometry and surface quality

- [#6](https://github.com/barocss/cad/issues/6) cad(kernel): general surface-surface intersection with loop guarantees, tangent detection and exact derivatives
- [#7](https://github.com/barocss/cad/issues/7) cad(kernel): Boolean robustness for contact cases (tangent, graze, edge/vertex touch, faceted faces), fuzz 38 to 0
- [#8](https://github.com/barocss/cad/issues/8) cad(kernel): certified predicates and tolerance growth for the curved arrangement and stitch (extends #1657)
- [#9](https://github.com/barocss/cad/issues/9) cad(kernel): explicit non-manifold and multi-result Boolean outputs
- [#10](https://github.com/barocss/cad/issues/10) cad(kernel): exact sweep solid along a path with frame laws (replace the faceted sweep)
- [#11](https://github.com/barocss/cad/issues/11) cad(kernel): exact thicken and general surface offset (first increment #2089)
- [#12](https://github.com/barocss/cad/issues/12) cad(kernel): fillet generality: vertex and setback blends, multi-face contact, variable radius, beyond 16 poles
- [#13](https://github.com/barocss/cad/issues/13) cad(kernel): shell (hollow) bodies with freeform faces and per-face thickness
- [#14](https://github.com/barocss/cad/issues/14) cad(kernel): draft generality: any sketch plane, non-tangent joints, adjacent and curved face draft
- [#15](https://github.com/barocss/cad/issues/15) cad(kernel): healing and tolerant modelling of imported geometry (gaps, slivers, small edges, orientation, seams)
- [#17](https://github.com/barocss/cad/issues/17) cad(kernel): B-rep direct editing: move, offset, delete and replace face with neighbour re-extension
- [#19](https://github.com/barocss/cad/issues/19) cad(kernel): raise NURBS degree and control-point limits (degree 5, 16 poles a surface direction)
- [#175](https://github.com/barocss/cad/issues/175) epic(cad): intersections, trims and solid boolean operations — `enhancement`
- [#176](https://github.com/barocss/cad/issues/176) epic(cad): detailed solid modelling operations — `enhancement`
- [#177](https://github.com/barocss/cad/issues/177) epic(cad): nurbs curve and surface authoring — `enhancement`
- [#304](https://github.com/barocss/cad/issues/304) design(cad): CAD 갤러리 14 — 보간·근사·Surface Trim·Fill
- [#305](https://github.com/barocss/cad/issues/305) design(cad): CAD 갤러리 15 — Surface Continuity·Extend·Join
- [#311](https://github.com/barocss/cad/issues/311) design(cad): gallery53 — two-cut Surface band and common-map strip Boolean
- [#368](https://github.com/barocss/cad/issues/368) [Design Gallery 60] 원통 patch normal thickness 결과 목표
- [#625](https://github.com/barocss/cad/issues/625) feat(cad-studio): SubD 점·모서리·영역의 로컬 변환과 명시적 피벗
- [#626](https://github.com/barocss/cad/issues/626) feat(cad-studio): SubD 연결 영역 선택 확대·축소와 최단 경로 선택
- [#627](https://github.com/barocss/cad/issues/627) feat(cad-studio): SubD 루프 삽입 위치 조절과 제한된 Edge Slide
- [#628](https://github.com/barocss/cad/issues/628) feat(cad-studio): 제한된 평면 SubD 영역 Inset과 기존 Extrude 연결
- [#629](https://github.com/barocss/cad/issues/629) research(cad-studio): B-rep 직관 조작 — body·face·edge·vertex 의미와 기존 명령 연결
- [#630](https://github.com/barocss/cad/issues/630) research(cad): 임의 단면 Screw·직선 Twist 생성 — 회전/피치 law와 Loft·Sweep 경계
- [#631](https://github.com/barocss/cad/issues/631) research(cad-studio): 연결 거리 기반 SubD 비례 이동과 영향 반경
- [#736](https://github.com/barocss/cad/issues/736) research(cad-studio): Macad3D 참고 — 단면 스케치에서 외곽·내부 윤곽만 가져오기
- [#739](https://github.com/barocss/cad/issues/739) research(cad-studio): FreeShape 참고 · 독립 Extrude의 병합 대상 미리보기

### P6 — Reuse real files and project data

- [#215](https://github.com/barocss/cad/issues/215) research(cad): Impact Design Similarity 참고 — 로컬 폐곡선 검색·크기·revision 계약
- [#263](https://github.com/barocss/cad/issues/263) research(cad): TurboCAD 참고 — 원형 instance 패턴의 seed 방향 유지와 파일 호환 계약
- [#278](https://github.com/barocss/cad/issues/278) research(cad): Cutaway 참고 — 참고 이미지 검토에서 부품별 분해 표현으로 이어지는 전달 계약
- [#280](https://github.com/barocss/cad/issues/280) research(cad): Shapr3D 26.210 참고 — 단위·배치·표시 색을 보존하는 유한 3MF mesh 가져오기
- [#307](https://github.com/barocss/cad/issues/307) design(cad): CAD 갤러리 19 — Configurations·Reorder·Parameter Cycles
- [#314](https://github.com/barocss/cad/issues/314) research(cad-ai): Maket 참고 — 평면도 축척·벽–개구부–방 관계와 설계단계 전달 계약
- [#367](https://github.com/barocss/cad/issues/367) [Design Gallery 31] 독립 문서 template · 교차 결과 · 검증과 거절

### AI — Agent workflow, evidence and interoperability

- [#204](https://github.com/barocss/cad/issues/204) feat(cad-studio): 기존 CAD 도구의 WebMCP 브라우저 어댑터 — 읽기 우선·승인 기반 편집
- [#206](https://github.com/barocss/cad/issues/206) research(cad): Buerligons 참고 — 기존 파라미터와 종속 수식·계산값의 Studio 소비자 계약
- [#312](https://github.com/barocss/cad/issues/312) research(cad-ai,gpu): Idol 단일 이미지→Gaussian splat의 참고 자산 계약과 CAD·로봇 권위 분리
- [#317](https://github.com/barocss/cad/issues/317) research(cad-ai): Construct 참고 — 부품별 근거·진단 연결과 blockout/CAD 검증 경계
- [#318](https://github.com/barocss/cad/issues/318) research(cad-ai): MLX-VLM 기반 선택적 로컬 시각 검토 backend 평가
- [#320](https://github.com/barocss/cad/issues/320) research(cad-ai): Hacadly 참고 — STEP 단일 부품의 새 편집 이력과 변형 검증
- [#321](https://github.com/barocss/cad/issues/321) perf(cad-dev): reduce validation setup and reruns with the shared Studio harness
- [#322](https://github.com/barocss/cad/issues/322) plan(cad-ai): 범용 AI-native CAD 로드맵과 대화형 명세·다중 agent·검증된 통합
- [#323](https://github.com/barocss/cad/issues/323) research(cad-ai): GenCAD 명령열 생성기의 권리·native 어댑터·편집성 비교 평가
- [#324](https://github.com/barocss/cad/issues/324) research(cad-ai): 67.js 참고 — 기존 MCP 호환성·도구 비용·revision별 시각 검토 평가
- [#325](https://github.com/barocss/cad/issues/325) plan(cad-ai): 외부 SolidWorks 하네스의 의미적 명령 호환표와 단일 부품 adapter MVP

### PLAN — Product-wide scope and architecture

- [#167](https://github.com/barocss/cad/issues/167) goal(cad): commercial CAD engine pillar of the own 3D library family — `enhancement`
- [#182](https://github.com/barocss/cad/issues/182) epic(cad): compiler front end, semantic model IR and lowering — `enhancement`
- [#201](https://github.com/barocss/cad/issues/201) research(cad): SolidCraft 문서 33개 전수 검토 — 신규 제안 3건·기존 이슈 연결·보류 범위
- [#213](https://github.com/barocss/cad/issues/213) plan(cad): SOLIDWORKS급 기계 CAD gap roadmap — SolidCraft 범위·검증 근거·전문 확장 분리

### HOLD — Physics, Motion, rendering study or manufacturing

- [#40](https://github.com/barocss/cad/issues/40) CAD Studio: Interference·Print 결과의 검사 범위와 부품 상태 표시 — `bug, ui/ux`
- [#49](https://github.com/barocss/cad/issues/49) CAD Studio CNC: 미리보기에서 건너뛴 가공과 공구 거부 이유 표시 — `bug, ui/ux`
- [#51](https://github.com/barocss/cad/issues/51) CAD Studio CNC: 같은 높이의 소재와 모델 윗면에 줄무늬가 생김 — `bug, ui/ux`
- [#63](https://github.com/barocss/cad/issues/63) CAD Studio CNC·Print: 미리보기 경고·범례·레이어 번호의 중복 표시 줄이기
- [#208](https://github.com/barocss/cad/issues/208) research(cad): Onshape 2026-10-30 참고 — 선택적 URDF fixed-link 축약과 원본 instance 추적
- [#209](https://github.com/barocss/cad/issues/209) research(cad): Teardown 참고 — 동일 기구 상태 기반 설명 패널·재현·투어 제어권
- [#210](https://github.com/barocss/cad/issues/210) research(cad): 18종 판금 금형 사례 — 형상·전개·공정/CAM·성형해석 단계별 로드맵 후보
- [#211](https://github.com/barocss/cad/issues/211) research(cad): OSH Cut MCP 제조 견적 연계 — capability 검증·도면 공유 승인·revision 계약
- [#313](https://github.com/barocss/cad/issues/313) research(cad-physics): PhysAg3D 참고 — 상호작용 요구·표면 바인딩·물리 증거 연결 계약
- [#315](https://github.com/barocss/cad/issues/315) roadmap(cad): 제조 단계 통합 지도 — 설계·출력·공정·장비별 검증·실물 인수 gate
- [#316](https://github.com/barocss/cad/issues/316) plan(cad-physics): Physics/Motion 통합 로드맵 — 기구학·강체 검증·자유동역학·실제 소비자 단계
- [#319](https://github.com/barocss/cad/issues/319) research(cad-cam): camlib 참고와 선택적 CAM 연계 계약·검증 경계
- [#328](https://github.com/barocss/cad/issues/328) PHYS-13: Bind planar Physics state to Canvas2D display objects
- [#329](https://github.com/barocss/cad/issues/329) SOFT-01: Discover a volumetric soft-body consumer
- [#330](https://github.com/barocss/cad/issues/330) GRANULAR-00: Discover a bounded sand and grains simulation
- [#331](https://github.com/barocss/cad/issues/331) FRACTURE-00: Discover breakable solid geometry and state rules
- [#332](https://github.com/barocss/cad/issues/332) GAS-00: Discover a smoke or gas simulation and display path
- [#333](https://github.com/barocss/cad/issues/333) VEHICLE-00: Discover wheel, suspension and traction requirements
- [#334](https://github.com/barocss/cad/issues/334) ROBOT-00: Discover articulated robotics requirements
- [#335](https://github.com/barocss/cad/issues/335) CFD-00: Define validation requirements for engineering fluid analysis
- [#336](https://github.com/barocss/cad/issues/336) FEM-00: Define validation requirements for finite-element solids
- [#337](https://github.com/barocss/cad/issues/337) GEOM-00: Discover a justified exact CAD collision case
- [#338](https://github.com/barocss/cad/issues/338) GRANULAR-01: Provide the bounded grain-pile CPU Physics world
- [#339](https://github.com/barocss/cad/issues/339) GRANULAR-02: Render a derived grain-sphere layer in the shared-depth GPU scene
- [#340](https://github.com/barocss/cad/issues/340) GRANULAR-03: Apply caller-owned grain-pile frames through Viewer
- [#341](https://github.com/barocss/cad/issues/341) GRANULAR-04: Deliver and gate the real 3D grain-pile Viewer host
- [#342](https://github.com/barocss/cad/issues/342) SOFT-02: Provide the bounded soft-block CPU Physics world
- [#343](https://github.com/barocss/cad/issues/343) SOFT-03: Render a derived soft-block boundary layer in the shared-depth GPU scene
- [#344](https://github.com/barocss/cad/issues/344) SOFT-04: Apply caller-owned soft-block frames through Viewer
- [#345](https://github.com/barocss/cad/issues/345) SOFT-05: Deliver and gate the real 3D soft-block compression Viewer host
- [#346](https://github.com/barocss/cad/issues/346) FRACTURE-01: Gate a precut cube release in the actual 3D Viewer host
- [#347](https://github.com/barocss/cad/issues/347) RIGID-06: Discover the precut box impact and floor-escape boundary
- [#348](https://github.com/barocss/cad/issues/348) GAS-01: Define a bounded CPU gas volume after pressure admission
- [#349](https://github.com/barocss/cad/issues/349) GAS-02: Render a bounded density volume with native depth occlusion
- [#350](https://github.com/barocss/cad/issues/350) GAS-03: Carry copied density volume frames through Viewer
- [#351](https://github.com/barocss/cad/issues/351) GAS-04: Gate a real 3D smoke plume in the Viewer host
- [#352](https://github.com/barocss/cad/issues/352) VEHICLE-01: Gate the bounded suspension reference in the actual 3D Viewer
- [#353](https://github.com/barocss/cad/issues/353) ROBOT-01: Gate a driven hinge natural stop in the actual 3D Viewer
- [#354](https://github.com/barocss/cad/issues/354) CFD-01: Define a bounded educational viscous-channel CPU profile
- [#355](https://github.com/barocss/cad/issues/355) CFD-02: Gate educational viscous-channel velocities in the actual 3D Viewer
- [#356](https://github.com/barocss/cad/issues/356) FEM-01: Provide a bounded educational cantilever CPU solid profile
- [#357](https://github.com/barocss/cad/issues/357) FEM-02: Gate an admitted cantilever solid in the actual 3D Viewer
- [#358](https://github.com/barocss/cad/issues/358) GEOM-01: Gate native plane and labelled collision proxy loss in the 3D Viewer
- [#359](https://github.com/barocss/cad/issues/359) GAS-DIAG-01: Diagnose fixed64 CG failure on coupled step201 input
- [#360](https://github.com/barocss/cad/issues/360) GAS-TRANSPORT-01: Qualify less diffusive conservative periodic tracer
- [#361](https://github.com/barocss/cad/issues/361) PHYS-ENGINE-00: Define and qualify the reusable 3D rigid-engine target
- [#362](https://github.com/barocss/cad/issues/362) PHYS-ENGINE-JOINT-00: Qualify two separated dynamic hinge pairs
- [#363](https://github.com/barocss/cad/issues/363) PHYS-HINGE-PUBLIC-01: Qualify public disjoint sphere-hinge components and measured step phases
- [#364](https://github.com/barocss/cad/issues/364) PHYS-HINGE-VIEWER-01: Display live public disjoint hinge states with recovery and cleanup
- [#365](https://github.com/barocss/cad/issues/365) PHYS-ENGINE-PUBLIC-02: Deliver the stable-stack public World acceptance milestone — `enhancement`
- [#370](https://github.com/barocss/cad/issues/370) review(robotics): motion sweep 예산 소진을 실제 contact·TOI와 구분
- [#371](https://github.com/barocss/cad/issues/371) research(robot-cell): Airsup 참고 — 기존 CAD 경로에 작업물·그립 실패·사이클 KPI 연결
- [#608](https://github.com/barocss/cad/issues/608) bug(studio): Turntable 동일 시간 seek의 카메라가 Play 이력에 따라 달라짐
- [#737](https://github.com/barocss/cad/issues/737) research(cad-studio): Nyxera simulator 참고 — 조립 검토 단계 재현성 검증
