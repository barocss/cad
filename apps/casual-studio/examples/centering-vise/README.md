# 셀프센터링 바이스 · 실제 CAD 형상 검증

Casual Studio 로드맵 5단계의 형상 검증용 예제다. [centering-vise.bcad](centering-vise.bcad)를 CAD Studio에서 열고 **Inspect → Variants → Show 60 mm opening**을 누른다. **Show the master**로 40 mm를 다시 표시한다.

| 실제 형상에서 잰 값 | 40 mm | 60 mm |
| --- | --- | --- |
| 왼쪽 조 안쪽 면 X | −20 mm | −30 mm |
| 오른쪽 조 안쪽 면 X | +20 mm | +30 mm |
| 작업 중심 X | 0 mm | 0 mm |
| 베이스 고정홀 | Ø6.6 mm 4개, X ±51 / Y ±23 mm | 동일 |

베이스와 양쪽 조는 닫힌 CAD 솔리드 세 개다. 공유 입력 `opening`의 허용 범위는 40–60 mm다. 40, 47.5, 60 mm에서 조 위치와 실제 관통 홀을 측정했고, 네이티브 파일 저장과 재열기 후에도 관계와 몸체 ID가 유지된다. 기계적인 나사, 체결, 하중, 충돌 또는 제작 공차의 검증은 아니다.

[40 mm 데스크탑 화면](01-40-mm.png) · [60 mm 데스크탑 화면](02-60-mm.png)

다음은 Casual에서 간격과 개별 부품 선택을 분리하고, 미리보기·적용·Undo·내보내기를 검증하는 단계다. 이 파일은 아직 Casual 시작 화면에 노출하지 않는다.

```sh
work=$(mktemp -d)
pnpm --filter @barocss/casual-studio-app test
pnpm exec esbuild apps/casual-studio/examples/centering-vise/build.ts --bundle --platform=node --format=esm --outfile="$work/build.mjs"
node "$work/build.mjs" "$work/centering-vise.bcad"
pnpm build
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chromium node apps/casual-studio/examples/centering-vise/capture.mjs "$work"
```
