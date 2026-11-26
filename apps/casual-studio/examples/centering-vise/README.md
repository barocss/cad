# 셀프센터링 바이스 · 실제 CAD 형상 검증

Casual Studio 시작 화면에서 **바이스 열기**를 선택한다. 캔버스에서 **조**를 클릭하면 그 조의 높이만 바꿀 수 있고, **물림 간격선**을 클릭하면 중심을 고정한 채 양쪽 조를 같이 움직인다. 베이스를 클릭하면 고정 치수와 홀 정보를 확인한다. [Casual 데스크탑 미리보기](03-casual-preview.png).

초기 형상만 확인하려면 [centering-vise.bcad](centering-vise.bcad)를 CAD Studio에서 열고 **Inspect → Variants → Show 60 mm opening**을 누른다. **Show the master**로 40 mm를 다시 표시한다.

| 실제 형상에서 잰 값 | 40 mm | 60 mm |
| --- | --- | --- |
| 왼쪽 조 안쪽 면 X | −20 mm | −30 mm |
| 오른쪽 조 안쪽 면 X | +20 mm | +30 mm |
| 작업 중심 X | 0 mm | 0 mm |
| 베이스 고정홀 | Ø6.6 mm 4개, X ±51 / Y ±23 mm | 동일 |

베이스와 양쪽 조는 닫힌 CAD 솔리드 세 개다. 공유 입력 `opening`의 허용 범위는 40–60 mm다. 40, 47.5, 60 mm에서 조 위치와 실제 관통 홀을 측정했고, 네이티브 파일 저장과 재열기 후에도 관계와 몸체 ID가 유지된다. 기계적인 나사, 체결, 하중, 충돌 또는 제작 공차의 검증은 아니다.

[40 mm 데스크탑 화면](01-40-mm.png) · [60 mm 데스크탑 화면](02-60-mm.png)

Casual에서 왼쪽 그립 15→17 mm를 적용한 뒤 간격 40→60 mm를 적용했다. Undo 한 번은 간격만 40 mm로 되돌리고 그립 17 mm를 유지하며, 두 번째 Undo가 그립을 15 mm로 되돌린다. 60 mm와 17 mm를 적용한 레시피를 다시 열고, 내보낸 .bcad를 CAD Studio에서 60→40 mm로 재계산해도 왼쪽 그립 17 mm가 유지된다.

```sh
work=$(mktemp -d)
pnpm --filter @barocss/casual-studio-app test
pnpm exec esbuild apps/casual-studio/examples/centering-vise/build.ts --bundle --platform=node --format=esm --outfile="$work/build.mjs"
node "$work/build.mjs" "$work/centering-vise.bcad"
pnpm build
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chromium node apps/casual-studio/examples/centering-vise/capture.mjs "$work"
```
