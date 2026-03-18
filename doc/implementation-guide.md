# 문서 검증 PoC 구현 가이드

## 1. 프로젝트 개요
이 프로젝트는 `web(Next.js)` + `api(Nest.js)` 구조에서 문서 업로드, OCR, 간단한 파싱 검증을 빠르게 테스트하기 위한 PoC입니다.

- Web: 파일 3개 업로드 UI + API 응답 표시
- API: `multipart/form-data` 업로드 수신 + `tesseract.js` OCR + 정규식 기반 파싱
- 목적: 문서 검증 기능의 최소 동작 경로 확인

## 2. 폴더 구조 설명

```text
root
 ┣ web
 ┃ ┗ app
 ┃   ┣ layout.tsx
 ┃   ┣ page.tsx
 ┃   ┗ globals.css
 ┣ api
 ┃ ┗ src
 ┃   ┣ main.ts
 ┃   ┣ app.module.ts
 ┃   ┣ app.controller.ts
 ┃   ┣ app.service.ts
 ┃   ┣ ocr
 ┃   ┃ ┗ ocr-engine.service.ts
 ┃   ┣ verification
 ┃   ┃ ┣ verification.controller.ts
 ┃   ┃ ┗ verification.service.ts
 ┃   ┗ types
 ┃     ┗ verification.types.ts
 ┗ doc
   ┗ implementation-guide.md
```

## 3. 설치한 패키지 설명

### api
- `multer`: 파일 업로드 파싱
- `tesseract.js`: Node 환경 OCR 처리
- `@types/multer`: TypeScript 타입 지원

### web
- 추가 패키지 없음 (기존 Next.js 스캐폴드 기반)

## 4. web 실행 방법

```bash
cd web
npm install
npm run dev -- -p 3000
```

브라우저에서 `http://localhost:3000` 접속

## 5. api 실행 방법

```bash
cd api
pnpm install
pnpm run start:dev
```

- API 포트: `4000`
- CORS 허용: `http://localhost:3000`
- 기본 헬스체크: `GET http://localhost:4000`

## 6. OCR 동작 방식 설명

1. `POST /verification/upload`로 파일 3개(`signPdf`, `powerOfAttorneyImage`, `receiptImage`)를 수신
2. `multer` `memoryStorage`로 파일을 메모리 버퍼로 처리
3. 이미지 파일(`powerOfAttorneyImage`, `receiptImage`)만 OCR 수행
4. `ocr-engine.service.ts`에서 `tesseract.js`로 OCR 수행
   - 1차: `kor+eng`
   - 실패 시: `eng` fallback
5. OCR raw text를 응답의 `ocr` 필드에 그대로 포함
6. OCR 텍스트를 합쳐 정규식으로 `principalName`, `agentName`, `caseNumber`, `itemNumber`를 파싱

## 7. 현재 한계점

- OCR 정확도는 문서 품질/기울기/해상도에 크게 의존
- 한글 문서는 `kor` 데이터 로딩 상태에 따라 인식 편차 존재
- 이름 파싱은 단순 정규식 기반이라 오탐/미탐 가능
- PDF(`signPdf`)는 현재 OCR 미수행(파일 메타데이터만 반환)
- 운영 환경 기준의 보안/스토리지/비동기 큐 처리는 아직 미적용

## 8. 추후 Textract 등으로 확장하는 방법

1. `api/src/ocr/ocr-engine.service.ts`를 OCR 추상화 포인트로 유지
2. 현재 `recognizeImage(buffer)` 구현만 AWS Textract 호출 로직으로 교체
3. `verification.service.ts`는 OCR 엔진 결과만 소비하도록 유지
4. 엔진 교체 시에도 컨트롤러/응답 스키마/프론트 화면은 최대한 그대로 사용
5. 대량 처리 시 큐(SQS), 저장소(S3), 비동기 워커 구조로 분리
