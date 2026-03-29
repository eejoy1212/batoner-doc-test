'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

type ParsedField = {
  value: string | null;
  confidence: number | null;
  needsReview: boolean;
};

type SpeedTestMode =
  | 'custom'
  | 'aggressive'
  | 'aggressive_plus'
  | 'crop_top'
  | 'crop_top_plus'
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

type SpeedTest2Response = {
  success: boolean;
  label: string;
  functionName: string;
  endpointPath: string;
  mode: SpeedTestMode;
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
    powerOfAttorneyImageText: string;
    powerOfAttorneyImageLines: Array<{
      text: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    powerOfAttorneyImageFormFields: Array<{
      name: string;
      value: string;
      confidence: number | null;
    }>;
    powerOfAttorneyImageEntities: Array<OcrEntityLike>;
    powerOfAttorneyImageOcrError: string | null;
  };
  parsed: {
    principalName: ParsedField;
    caseNumber: ParsedField;
  };
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

type RawOverlayTarget = {
  id: string;
  label: string;
  value: string | null;
  box?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
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

  const expectedTokens = normalizedExpected.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  const mentionTokens = normalizedMention.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  const sharedTokenCount = expectedTokens.filter((token) =>
    mentionTokens.includes(token),
  ).length;

  return sharedTokenCount > 0 ? 1 + sharedTokenCount * 0.1 : 0;
}

export default function SpeedTest2Page() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [warming, setWarming] = useState(false);
  const [useWarmup, setUseWarmup] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SpeedTest2Response | null>(null);
  const [previewDims, setPreviewDims] = useState<{ width: number; height: number } | null>(null);
  const [selectedMode, setSelectedMode] = useState<SpeedTestMode>('aggressive_plus');

  const warmupProcessor = async () => {
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
    setPreviewDims(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!file) {
      setErrorMessage('위임장 이미지 파일을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);
      if (useWarmup) {
        await warmupProcessor();
      }
      const formData = new FormData();
      formData.append('powerOfAttorneyImage', file);
      formData.append('mode', selectedMode);

      const response = await fetch(`${getApiBaseUrl()}/verification/speed-test/2`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as SpeedTest2Response | {
        message?: string | string[];
      };

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '속도 테스트 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setResult(data as SpeedTest2Response);
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
        { label: '입찰인 이름', data: result.parsed.principalName },
        { label: '사건번호', data: result.parsed.caseNumber },
      ]
    : [];

  const overlayBoxes: OverlayBox[] = result
    ? (() => {
        const bestEntityByTypes = (types: string[], expectedValue: string | null) => {
          const candidates = result.ocr.powerOfAttorneyImageEntities.filter((entity) =>
            types.some((type) =>
              normalizeForMatch(entity.type).includes(normalizeForMatch(type)),
            ),
          );

          if (candidates.length === 0) {
            return undefined;
          }

          return [...candidates].sort((left, right) => {
            const scoreDiff =
              scoreEntityMatch(right, expectedValue) -
              scoreEntityMatch(left, expectedValue);
            if (scoreDiff !== 0) {
              return scoreDiff;
            }

            const leftArea =
              Math.max(0, (left.right ?? 0) - (left.left ?? 0)) *
              Math.max(0, (left.bottom ?? 0) - (left.top ?? 0));
            const rightArea =
              Math.max(0, (right.right ?? 0) - (right.left ?? 0)) *
              Math.max(0, (right.bottom ?? 0) - (right.top ?? 0));

            return leftArea - rightArea;
          })[0];
        };
        const toBox = (entity?: OcrEntityLike) =>
          entity &&
          typeof entity.left === 'number' &&
          typeof entity.top === 'number' &&
          typeof entity.right === 'number' &&
          typeof entity.bottom === 'number'
            ? {
                left: entity.left,
                top: entity.top,
                right: entity.right,
                bottom: entity.bottom,
              }
            : undefined;

        const coordinateWidth = Math.max(1, result.preview.coordinateSpace.width || 1);
        const coordinateHeight = Math.max(1, result.preview.coordinateSpace.height || 1);
        const globalOffsetXPct = 0.08;
        const globalOffsetYPct = 0.06;

        const rawTargets: Array<RawOverlayTarget | null> = [
          {
            id: 'principalName',
            label: '입찰인 이름',
            value: result.parsed.principalName.value,
            box: toBox(
              bestEntityByTypes(
                ['bidderName', 'principalName'],
                result.parsed.principalName.value,
              ),
            ),
          },
          {
            id: 'caseNumber',
            label: '사건번호',
            value: result.parsed.caseNumber.value,
            box: toBox(
              bestEntityByTypes(['caseNumber'], result.parsed.caseNumber.value),
            ),
          },
        ];

        return rawTargets
          .filter((item): item is RawOverlayTarget => item !== null)
          .filter((item) => item.box)
          .map((item) => {
            const box = item.box!;
            const baseLeftPct = (box.left / coordinateWidth) * 100;
            const baseTopPct = (box.top / coordinateHeight) * 100;
            const baseWidthPct = ((box.right - box.left) / coordinateWidth) * 100;
            const baseHeightPct = ((box.bottom - box.top) / coordinateHeight) * 100;
            const inflateX = Math.max(0.8, baseWidthPct * 0.12);
            const inflateY = Math.max(0.8, baseHeightPct * 0.32);
            const leftPct = Math.max(0, baseLeftPct - inflateX / 2 + globalOffsetXPct);
            const topPct = Math.max(0, baseTopPct - inflateY / 2 + globalOffsetYPct);
            const widthPct = Math.min(100 - leftPct, Math.max(1.6, baseWidthPct + inflateX));
            const heightPct = Math.min(100 - topPct, Math.max(2.2, baseHeightPct + inflateY));

            return {
              id: item.id,
              label: item.label,
              value: item.value ?? '',
              leftPct,
              topPct,
              widthPct,
              heightPct,
            };
          });
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
          <h1>속도 테스트 2</h1>
          <p className="description">
            `/speedTest/2` 전용 화면입니다. 위임장 이미지만 업로드해서 OCR과 파싱 결과를 바로 확인할 수 있습니다.
          </p>
          <div className="speed-test-meta">
            <div>
              <span>페이지</span>
              <strong>/speedTest/2</strong>
            </div>
            <div>
              <span>API</span>
              <strong>/verification/speed-test/2</strong>
            </div>
          </div>
        </section> */}

        <section className="speed-test-panel">
           <div className="page-actions">
            <Link href="/">메인 테스트 페이지로 돌아가기</Link>
          </div>
          <form className="upload-form" onSubmit={handleSubmit}>
            <label>
              <span>위임장 이미지 업로드</span>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
            {/* <div className="speed-test-mode-row">
              {([
                { key: 'custom', label: 'Custom' },
                { key: 'aggressive', label: 'Aggressive' },
                { key: 'aggressive_plus', label: 'Aggressive+' },
                { key: 'crop_top', label: 'Crop Top' },
                { key: 'crop_top_plus', label: 'Crop Top+' },
                { key: 'fast_first', label: 'Fast First' },
              ] as Array<{ key: SpeedTestMode; label: string }>).map((mode) => (
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
                위임장 warmup 사용
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
                <span>OCR 라인 수</span>
                <strong>{result.ocr.powerOfAttorneyImageLines.length}</strong>
              </div>
              <div>
                <span>엔티티 수</span>
                <strong>{result.ocr.powerOfAttorneyImageEntities.length}</strong>
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
              </div>
              {result.preview.imageBase64 && result.preview.mimeType && (
                <div className="speed-test-preview-wrap speed-test-overlay-wrap">
                  <img
                    src={`data:${result.preview.mimeType};base64,${result.preview.imageBase64}`}
                    alt="위임장 미리보기"
                    className="speed-test-preview"
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (!naturalWidth || !naturalHeight) {
                        return;
                      }
                      setPreviewDims({ width: naturalWidth, height: naturalHeight });
                    }}
                  />
                  {previewDims &&
                    overlayBoxes.map((box) => (
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
              {result.ocr.powerOfAttorneyImageOcrError ? (
                <p className="error-message">OCR 오류: {result.ocr.powerOfAttorneyImageOcrError}</p>
              ) : (
                <pre className="speed-test-pre">
                  {result.ocr.powerOfAttorneyImageText || '(빈 텍스트)'}
                </pre>
              )}
            </article>

            <article className="speed-test-card">
              <h2>OCR 엔티티</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.powerOfAttorneyImageEntities, null, 2)}
              </pre>
            </article>

            <article className="speed-test-card">
              <h2>OCR Form Fields</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.powerOfAttorneyImageFormFields, null, 2)}
              </pre>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
