# 로버 조립 예제 · Casual Studio와 CAD Studio

[RoverKit의 공개 가이드](https://a2aprotocol.ai/tools/roverkit)에서 가져온 것은 **완성 상태 → 분해도 → 단계별 강조**라는 화면 흐름이다. 아래 부품과 형상은 BaroCSS의 원래 피처로 새로 만들었다. RoverKit의 원본 메시, 코드, 주행 시뮬레이션은 사용하지 않았다.

| 실제 CAD Studio 화면 | 확인할 것 |
| --- | --- |
| [조립 상태](01-assembled.png) | 하판과 상판, 바퀴·축·모터, 전원과 보드, 앞쪽 센서 |
| [분해도](02-exploded.png) | 축과 바퀴, 두 판 사이 고정점, 앞 센서의 상대 위치 |
| [조립 2단계](03-assembly-step.png) | 상판과 네 스탠드오프를 강조하고 이후 장착할 부품은 숨김 |

[rover-assembly.bcad](rover-assembly.bcad)를 CAD Studio의 **Open**으로 열 수 있다. **Explode**는 화면 배치만 바꾸고, `Space` → `Assembly steps`는 저장된 단계(구동부 → 상판/고정점 → 전원·제어부 → 앞 센서)를 보여준다. 네이티브 루트 하판과 배치된 occurrence 24개, 총 닫힌 솔리드 25개를 확인했다. 저장된 24개 고정 메이트는 편집할 수 있지만, 실제 회전 관절이나 주행이 구현된 모델은 아니다. 전기 배선·간섭·강도·제작 공차를 검증한 것도 아니다.

## Casual Studio에서 보기

시작 화면의 **로버 조립 보기**를 열면 같은 네이티브 파일에서 계산한 25개 부품을 볼 수 있다. 캔버스를 드래그하거나 방향키를 눌러 회전하고, **조립 / 분해**를 바꾸거나 오른쪽에서 네 단계를 고른다. 단계에 들어오면 이번에 추가하는 부품만 파란색으로 강조되고, 이후 단계의 부품은 표시·선택되지 않는다. 선택은 캔버스와 단계별 부품 목록에서 모두 가능하다.

| 실제 Casual Studio 화면 | 확인할 것 |
| --- | --- |
| [전체 조립](04-casual-assembled.png) | 원본 배치에서 마우스로 회전하고 부품 선택 |
| [4단계와 분해도](05-casual-sensor-step.png) | 전방 거리 센서의 실제 부품 4개 강조, 센서 보드 선택 |

**원본 CAD 받기**는 읽어온 원본 바이트를 그대로 내려준다. 데스크탑 Chrome에서 전체 조립 화면과 분해도, 네 단계와 이전 단계로 돌아갈 때 대기 부품의 선택 차단, 화면 보기 전후 파일의 바이트 일치를 확인했다. 받은 파일을 CAD Studio에서 다시 열면 배치 부품 24개와 저장 단계 4개가 유지된다. Casual은 이 로버의 위치, 치수, 메이트를 편집하지 않는다.

## 재현

저장소 루트에서 예제를 생성한다. 생성기는 실제 B-rep 25개, 저장/재열기, 메이트가 유지하는 위치, 네 단계의 부품 중복 여부를 검증한다.

```sh
work=$(mktemp -d)
pnpm exec esbuild apps/casual-studio/examples/rover-assembly/build.ts --bundle --platform=node --format=esm --outfile="$work/build.mjs"
node "$work/build.mjs" "$work/rover-assembly.bcad"
pnpm build
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chromium node apps/casual-studio/examples/rover-assembly/capture.mjs "$work"
```

브라우저 캡처 스크립트는 저장소에 체크인된 검증용 파일을 열어 실제 Studio에서 촬영한다.
