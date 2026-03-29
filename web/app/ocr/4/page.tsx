'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

type ParsedField = {
  value: string | null;
  confidence: number | null;
  needsReview: boolean;
};

type BidSheetSpeedTestMode =
  | 'custom'
  | 'generic_bid_sheet'
  | 'aggressive'
  | 'aggressive_plus'
  | 'crop_table'
  | 'fast_first';

type OcrEntityLike = {
  type: string;
  mentionText: string;
  confidence: number | null;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
};

type OcrLineLike = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type OverlayBox = {
  id: string;
  label: string;
  value: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

type SpeedTest4Response = {
  success: boolean;
  label: string;
  functionName: string;
  endpointPath: string;
  mode: BidSheetSpeedTestMode;
  timings: {
    prepareInputMs: number;
    ocrMs: number;
    parseMs: number;
    totalMs: number;
  };
  fallbackUsed: boolean;
  optimization: {
    applied: boolean;
    strategy: string;
    sourceMimeType: string;
    outputMimeType: string;
    originalBytes: number;
    optimizedBytes: number;
  };
  preview: {
    imageBase64: string | null;
    mimeType: string | null;
    coordinateSpace: {
      width: number;
      height: number;
    };
  };
  file: {
    originalname: string;
    mimetype: string;
    size: number;
  } | null;
  ocr: {
    bidSheetImageText: string;
    bidSheetImageLines: OcrLineLike[];
    bidSheetImageFormFields: Array<{
      name: string;
      value: string;
      confidence: number | null;
    }>;
    bidSheetImageEntities: OcrEntityLike[];
    bidSheetImageOcrError: string | null;
  };
  parsed: {
    caseNumber: ParsedField;
    itemName: ParsedField;
  };
};

function normalizeForMatch(value: string): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase().trim();
}

function scoreEntityMatch(entity: OcrEntityLike, expectedValue: string | null): number {
  const normalizedExpected = normalizeForMatch(expectedValue ?? '');
  const normalizedMention = normalizeForMatch(entity.mentionText ?? '');

  if (!normalizedExpected || !normalizedMention) {
    return 0;
  }
  if (normalizedMention === normalizedExpected) {
    return 5;
  }
  if (normalizedMention.includes(normalizedExpected)) {
    return 4;
  }
  if (normalizedExpected.includes(normalizedMention)) {
    return 3;
  }
  return 0;
}

function scoreLineMatch(line: OcrLineLike, expectedValue: string | null): number {
  const normalizedExpected = normalizeForMatch(expectedValue ?? '');
  const normalizedLine = normalizeForMatch(line.text ?? '');

  if (!normalizedExpected || !normalizedLine) {
    return 0;
  }
  if (normalizedLine === normalizedExpected) {
    return 4.5;
  }
  if (normalizedLine.includes(normalizedExpected)) {
    return 3.5;
  }
  if (normalizedExpected.includes(normalizedLine)) {
    return 2.5;
  }
  return 0;
}

export default function SpeedTest4Page() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [warming, setWarming] = useState(false);
  const [useWarmup, setUseWarmup] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SpeedTest4Response | null>(null);
  const [selectedMode, setSelectedMode] = useState<BidSheetSpeedTestMode>('aggressive_plus');

  const warmupBidSheetProcessor = async () => {
    setWarming(true);
    try {
      await fetch(`${getApiBaseUrl()}/verification/warmup`, {
        method: 'POST',
      });
    } finally {
      setWarming(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!file) {
      setErrorMessage('기일입찰표 이미지 파일을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);
      if (useWarmup) {
        await warmupBidSheetProcessor();
      }
      const formData = new FormData();
      formData.append('bidSheetImage', file);
      formData.append('mode', selectedMode);

      const response = await fetch(`${getApiBaseUrl()}/verification/speed-test/4`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as
        | SpeedTest4Response
        | { message?: string | string[] };

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '속도 테스트 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setResult(data as SpeedTest4Response);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  const parsedFields = result
    ? [
        { label: '사건번호', data: result.parsed.caseNumber },
        { label: '물건번호', data: result.parsed.itemName },
      ]
    : [];

  const overlayBoxes: OverlayBox[] = result
    ? (() => {
        const coordinateWidth = Math.max(1, result.preview.coordinateSpace.width || 1);
        const coordinateHeight = Math.max(1, result.preview.coordinateSpace.height || 1);
        const toBox = (
          value: string | null,
          entityTypes: string[],
          id: string,
          label: string,
        ): OverlayBox | null => {
          const entityCandidates = result.ocr.bidSheetImageEntities
            .filter((entity) =>
              entityTypes.some((type) =>
                normalizeForMatch(entity.type).includes(normalizeForMatch(type)),
              ),
            )
            .filter(
              (entity) =>
                typeof entity.left === 'number' &&
                typeof entity.top === 'number' &&
                typeof entity.right === 'number' &&
                typeof entity.bottom === 'number',
            )
            .sort(
              (left, right) =>
                scoreEntityMatch(right, value) - scoreEntityMatch(left, value),
            );

          const lineCandidates = result.ocr.bidSheetImageLines
            .filter((line) => scoreLineMatch(line, value) > 0)
            .sort((left, right) => scoreLineMatch(right, value) - scoreLineMatch(left, value));

          const entityBox = entityCandidates[0];
            const lineBox = lineCandidates[0];
            const box =
              entityBox && scoreEntityMatch(entityBox, value) > 0
                ? entityBox
                : lineBox;
  
            if (!box || !value) {
              return null;
            }
  
            const hasCoordinates = (
              b: OcrEntityLike | OcrLineLike,
            ): b is OcrEntityLike & { left: number; top: number; right: number; bottom: number } | OcrLineLike => {
              return typeof b.left === 'number' && typeof b.top === 'number' && typeof b.right === 'number' && typeof b.bottom === 'number';
            };
  
            if (!hasCoordinates(box)) {
              return null;
            }
  
            const baseLeftPct = (box.left / coordinateWidth) * 100;
            const baseTopPct = (box.top / coordinateHeight) * 100;
            const baseWidthPct = ((box.right - box.left) / coordinateWidth) * 100;
            const baseHeightPct = ((box.bottom - box.top) / coordinateHeight) * 100;
          const inflateX = Math.max(0.9, baseWidthPct * 0.18);
          const inflateY = Math.max(0.9, baseHeightPct * 0.38);
          const leftPct = Math.max(0, baseLeftPct - inflateX / 2);
          const topPct = Math.max(0, baseTopPct - inflateY / 2);
          const widthPct = Math.min(100 - leftPct, Math.max(1.8, baseWidthPct + inflateX));
          const heightPct = Math.min(100 - topPct, Math.max(2.2, baseHeightPct + inflateY));

          return {
            id,
            label,
            value,
            leftPct,
            topPct,
            widthPct,
            heightPct,
          };
        };

        return [
          toBox(result.parsed.caseNumber.value, ['caseNumber', '사건번호'], 'caseNumber', '사건번호'),
          toBox(result.parsed.itemName.value, ['itemNumber', '물건번호'], 'itemNumber', '물건번호'),
        ].filter((item): item is OverlayBox => item !== null);
      })()
    : [];

  return (
    <div className="page-wrap">
      <main className="speed-test-shell">
        {/* <section className="speed-test-hero">
          <div className="page-actions">
            <Link href="/">메인 테스트 페이지로 돌아가기</Link>
          </div>
          <p className="speed-test-kicker">Dedicated Route</p>
          <h1>속도 테스트 4</h1>
          <p className="description">
            `/speedTest/4` 전용 화면입니다. 기일입찰표 이미지만 업로드해서 OCR, 파싱 결과, 속도 개선 모드를 비교할 수 있습니다.
          </p>
          <div className="speed-test-meta">
            <div>
              <span>페이지</span>
              <strong>/speedTest/4</strong>
            </div>
            <div>
              <span>API</span>
              <strong>/verification/speed-test/4</strong>
            </div>
          </div>
        </section> */}

        <section className="speed-test-panel">
          <div className="page-actions">
            <Link href="/">메인 테스트 페이지로 돌아가기</Link>
          </div>
          <form className="upload-form" onSubmit={handleSubmit}>
            <label>
              <span>기일입찰표 이미지 업로드</span>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
            {/* <div className="speed-test-mode-row">
              {([
                { key: 'custom', label: 'Custom' },
                { key: 'generic_bid_sheet', label: 'Generic OCR' },
                { key: 'aggressive', label: 'Aggressive' },
                { key: 'aggressive_plus', label: 'Aggressive+' },
                { key: 'crop_table', label: 'Crop Table' },
                { key: 'fast_first', label: 'Fast First' },
              ] as Array<{ key: BidSheetSpeedTestMode; label: string }>).map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={selectedMode === mode.key ? 'speed-test-mode active' : 'speed-test-mode'}
                  onClick={() => setSelectedMode(mode.key)}
                  disabled={loading}
                >
                  {mode.label}
                </button>
              ))}
            </div> */}
            {/* <label className="speed-test-toggle">
              <input
                type="checkbox"
                checked={useWarmup}
                onChange={(event) => setUseWarmup(event.target.checked)}
                disabled={loading || warming}
              />
              <span className="speed-test-toggle-track" aria-hidden="true">
                <span className="speed-test-toggle-thumb" />
              </span>
              <span className="speed-test-toggle-text">
                기일입찰표 warmup 사용
                {warming ? ' (실행 중...)' : ''}
              </span>
            </label> */}
            <button type="submit" disabled={loading}>
              {loading ? '업로드 실행 중...' : '업로드 실행'}
            </button>
          </form>

          {errorMessage && <p className="error-message">에러: {errorMessage}</p>}

          {result && (
            <div className="speed-test-summary">
              <div>
                <span>실행 모드</span>
                <strong>{result.mode}</strong>
              </div>
              <div>
                <span>함수명</span>
                <strong>{result.functionName}</strong>
              </div>
              <div>
                <span>총 소요 시간</span>
                <strong>{result.timings.totalMs}ms</strong>
              </div>
              <div>
                <span>Fallback</span>
                <strong>{result.fallbackUsed ? 'Y' : 'N'}</strong>
              </div>
            </div>
          )}
        </section>

        {result && (
          <section className="speed-test-grid">
            <article className="speed-test-card">
              <h2>파싱 결과</h2>
              <div className="speed-test-fields">
                {parsedFields.map((field) => (
                  <div key={field.label} className="speed-test-field-card">
                    <span>{field.label}</span>
                    <strong>{field.data.value || '-'}</strong>
                    <small>
                      confidence:{' '}
                      {typeof field.data.confidence === 'number'
                        ? field.data.confidence.toFixed(3)
                        : 'null'}
                    </small>
                    <small>검토 필요: {field.data.needsReview ? 'Y' : 'N'}</small>
                  </div>
                ))}
              </div>
            </article>

            {/* <article className="speed-test-card">
              <h2>단계별 시간</h2>
              <div className="speed-test-file-meta">
                <p>입력 준비: {result.timings.prepareInputMs}ms</p>
                <p>OCR 호출: {result.timings.ocrMs}ms</p>
                <p>파싱: {result.timings.parseMs}ms</p>
                <p>전체: {result.timings.totalMs}ms</p>
              </div>
            </article> */}

            <article className="speed-test-card">
              <h2>업로드 파일</h2>
              <div className="speed-test-file-meta">
                <p>MIME: {result.file?.mimetype ?? '-'}</p>
                <p>크기: {result.file ? `${result.file.size.toLocaleString()} bytes` : '-'}</p>
                <p>최적화 전략: {result.optimization.strategy}</p>
              </div>
              {result.preview.imageBase64 && result.preview.mimeType && (
                <div className="speed-test-preview-wrap speed-test-overlay-wrap">
                  <img
                    src={`data:${result.preview.mimeType};base64,${result.preview.imageBase64}`}
                    alt="기일입찰표 미리보기"
                    className="speed-test-preview"
                  />
                  {overlayBoxes.map((box) => (
                    <div
                      key={box.id}
                      className="speed-test-overlay-box"
                      style={{
                        left: `${box.leftPct}%`,
                        top: `${box.topPct}%`,
                        width: `${box.widthPct}%`,
                        height: `${box.heightPct}%`,
                      }}
                      title={`${box.label}: ${box.value}`}
                    >
                      <span className="speed-test-overlay-label">{box.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="speed-test-card">
              <h2>OCR 텍스트</h2>
              {result.ocr.bidSheetImageOcrError ? (
                <p className="error-message">OCR 오류: {result.ocr.bidSheetImageOcrError}</p>
              ) : (
                <pre className="speed-test-pre">
                  {result.ocr.bidSheetImageText || '(빈 텍스트)'}
                </pre>
              )}
            </article>

            <article className="speed-test-card">
              <h2>OCR 엔티티</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.bidSheetImageEntities, null, 2)}
              </pre>
            </article>

            <article className="speed-test-card">
              <h2>OCR Form Fields</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.bidSheetImageFormFields, null, 2)}
              </pre>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
