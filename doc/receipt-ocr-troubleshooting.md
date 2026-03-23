# 영수증 OCR 트러블슈팅 기록

## 배경
- 영수증 이미지에서 `사건번호`, `물건번호` 값은 비교적 정확히 읽히는데 `confidence`가 낮게 나오는 이슈가 반복됨.
- 예시: `사건번호`가 `2025 타경 55708`으로 추출되지만 confidence가 `0.53` 수준.

## 원인 정리
- Form Processor의 `formField.confidence`는 문자 자체 인식 정확도보다, 라벨-값 매칭 안정도에 크게 영향을 받음.
- 영수증은 표 셀 구조, 촬영 기울기, 작은 글자/공백(예: `2025 타경 55708`) 때문에 매칭 confidence가 낮아지기 쉬움.
- `물건번호`처럼 짧은 값(한 자리 숫자)은 모델이 보수적으로 낮은 confidence를 주는 경우가 많음.

## 코드 변경 내역
- 파일: `api/src/verification/verification.service.ts`
- 변경 목표: 영수증 OCR에서 실제 인식 품질을 높이고(`전처리`), 파싱은 다중 소스 기반으로 안정화.

### 1) 다중 소스 후보 추출
- `사건번호`: `entity -> formField -> regex(text/line/formField/entity)` 순서로 후보 선택.
- `물건번호`: `entity -> formField -> regex(text/line/formField/entity)` 순서로 후보 선택.

### 2) 값 정규화
- 사건번호는 공백/분리 표기를 정규화해서 `YYYY타경NNNNN` 형태로 통일.
- 물건번호는 숫자만 추출해 정규화.

### 3) 이미지 전처리 + 다중 OCR 후보 비교
- 원본 이미지 OCR 수행.
- 전처리 이미지를 여러 버전으로 생성:
  - `normalized`: rotate + grayscale + normalize + sharpen (+ 필요 시 upscale)
  - `binarized`: rotate + grayscale + contrast + threshold + sharpen
  - `contrastHeavy`: rotate + 강한 대비 + normalize + sharpen
- 각 후보에 대해 OCR 수행 후 사건번호/물건번호 관련 점수를 계산해 최종 결과 선택.
- 즉, confidence를 임의로 올리지 않고 모델이 실제로 산출한 confidence만 사용.
- API 응답의 `ocr.receiptImageOcrDebug`로 실제 선택된 변형(`selectedVariant`)과 후보별 점수(`scores`)를 확인 가능.

## 운영 가이드
- 촬영 시 문서를 화면의 80~90% 이상 차지하도록 크게 촬영.
- 표 라인이 수평이 되도록 정면 촬영.
- 그림자/손/배경이 문서 위로 들어오지 않게 촬영.
- 가능하면 스캔 앱(자동 crop + deskew) 사용 후 업로드.

## 남은 리스크
- 패턴에 맞는 오탐 문자열이 들어오면 후보로 선택될 수 있음.
- 원본 해상도/원근 왜곡이 큰 경우, 전처리를 해도 Form Field confidence 개선이 제한적일 수 있음.
- 필요 시 사건번호/물건번호 검증 규칙을 추가 강화(예: 사건 연도 범위, 물건번호 최대 자릿수 제한) 권장.
