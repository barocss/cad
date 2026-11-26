# 센서 케이스 · 치수 관계 검증

Casual Studio 시작 화면에는 아직 노출하지 않은 검증용 예제다. CAD Studio에서 [sensor-enclosure.bcad](sensor-enclosure.bcad)를 **Open**으로 열고 **Inspect → Variants → Show 64 mm board**를 눌러 비교할 수 있다. 기본값으로 돌아가려면 **Show the master**를 누른다.

| 실제 형상에서 잰 값 | 기본값 | 64 mm 보드 |
| --- | --- | --- |
| 보드 폭 | 56 mm | 64 mm |
| 본체·뚜껑 폭 | 64 mm | 72 mm |
| 오른쪽 고정점 2개, 왼쪽 기준 X | 54 mm | 62 mm |
| 왼쪽 고정점 2개, 왼쪽 기준 X | 10 mm | 10 mm |
| 앞쪽 관통 포트 | 10 × 6 mm | 10 × 6 mm |

본체, 뚜껑, PCB, 지지대 네 개는 일곱 개의 닫힌 B-rep이다. 기존 CAD Studio의 Variants 입력 `boardWidth`(56–64 mm) 하나가 본체 외폭, 내부 벽, PCB 우측 경계와 두 우측 고정점을 구동한다. 네 보어도 각 지지대 축에 맞는다. 저장 후 재열기에서 입력과 관계가 유지된다. 지지대는 형상 확인용 별도 솔리드이며 나사 체결, 뚜껑 고정 방식, 제작 공차는 검증 범위가 아니다.

[56 mm 데스크탑 검증](01-56-mm.png) · [64 mm 데스크탑 검증](02-64-mm.png) · [뚜껑을 숨긴 내부](03-interior.png)

## 재현

저장소 루트에서:

```sh
work=$(mktemp -d)
pnpm --filter @barocss/casual-studio-app test
pnpm exec esbuild apps/casual-studio/examples/sensor-enclosure/build.ts --bundle --platform=node --format=esm --outfile="$work/build.mjs"
node "$work/build.mjs" "$work/sensor-enclosure.bcad"
pnpm build
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chromium node apps/casual-studio/examples/sensor-enclosure/capture.mjs "$work"
```

형상 테스트는 56, 60.5, 64 mm에서 솔리드의 경계, PCB 보어, 고정점과 관통 포트를 확인한다. 브라우저 재현은 데스크탑 화면의 파일 열기와 56 ↔ 64 mm 전환을 확인한다.
