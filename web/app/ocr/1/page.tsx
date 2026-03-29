'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChangeEvent, FormEvent, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

type ParsedField = {
  value: string | null;
  confidence: number | null;
  needsReview: boolean;
};

type SpeedTestMode =
  | 'custom'
  | 'layout'
  | 'aggressive'
  | 'aggressive_plus'
  | 'crop_top'
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
  value: string;
  box: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | undefined;
};

type SpeedTestResponse = {
  success: boolean;
  label: string;
  functionName: string;
  endpointPath: string;
  elapsedMs: number;
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
    signPdfText: string;
    signPdfLines: Array<{
      text: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    signPdfFormFields: Array<{
      name: string;
      value: string;
      confidence: number | null;
    }>;
    signPdfEntities: Array<{
      type: string;
      mentionText: string;
      confidence: number | null;
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
    }>;
    signPdfOcrError: string | null;
  };
  parsed: {
    principalName: ParsedField;
    agentName: ParsedField;
    submissionInstitution: ParsedField;
    purposeCourtName: ParsedField;
    caseNumber: ParsedField;
    itemName: ParsedField;
  };
};

function normalizeForMatch(value: string): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase().trim();
}

function extractPurposeCourtFromText(value: string): string | null {
  const source = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!source) {
    return null;
  }
  const core = source.match(/\(([^)]+)\)/)?.[1] ?? source;
  const matched = core.match(/[가-힣\s]+(?:지방법원|고등법원|법원)(?:\s*[가-힣]+\s*(?:지원|본원))?/);
  return matched?.[0]?.trim() ?? null;
}

function extractPurposeCaseNumberFromText(value: string): string | null {
  const source = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!source) {
    return null;
  }
  const core = source.match(/\(([^)]+)\)/)?.[1] ?? source;
  const normalized = core.replace(/\s+/g, '');
  const strict = normalized.match(/[12]\d{3}타경\d{3,}/);
  if (strict?.[0]) {
    return strict[0];
  }
  const loose = core.match(/[12]\d\s*\d\s*타\s*경\s*\d{3,}|[12]\d{3}\s*타\s*경\s*\d{3,}/);
  return loose?.[0]?.trim() ?? null;
}

function extractPurposeItemNumberFromText(value: string): string | null {
  const source = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!source) {
    return null;
  }
  const core = source.match(/\(([^)]+)\)/)?.[1] ?? source;
  const bracket = core.match(/\[\s*\d{1,3}\s*\]/)?.[0];
  if (bracket) {
    return bracket.trim();
  }
  return core.match(/물건\s*번?\s*호\s*[:：]?\s*\d{1,3}/)?.[0]?.trim() ?? null;
}

function projectEntitySubBox(
  entity: OcrEntityLike | undefined,
  candidates: Array<string | null | undefined>,
): { left: number; top: number; right: number; bottom: number } | undefined {
  if (
    !entity ||
    typeof entity.left !== 'number' ||
    typeof entity.top !== 'number' ||
    typeof entity.right !== 'number' ||
    typeof entity.bottom !== 'number'
  ) {
    return undefined;
  }

  const hay = normalizeForMatch(entity.mentionText ?? '');
  if (!hay) {
    return undefined;
  }

  let best: { start: number; end: number; len: number } | null = null;
  for (const candidate of candidates) {
    const needle = normalizeForMatch(candidate ?? '');
    if (!needle || needle.length < 2) {
      continue;
    }
    const start = hay.indexOf(needle);
    if (start < 0) {
      continue;
    }
    const end = start + needle.length;
    if (!best || needle.length > best.len) {
      best = { start, end, len: needle.length };
    }
  }

  if (!best) {
    return undefined;
  }

  const fullWidth = Math.max(1, entity.right - entity.left);
  const startRatio = best.start / hay.length;
  const endRatio = best.end / hay.length;
  const left = entity.left + fullWidth * Math.max(0, startRatio - 0.03);
  const right = entity.left + fullWidth * Math.min(1, endRatio + 0.03);

  return {
    left,
    top: entity.top,
    right,
    bottom: entity.bottom,
  };
}

export default function SpeedTest1Page() {
  const pathname = usePathname();
  const testId = pathname?.split('/').filter(Boolean).at(-1) ?? '1';
  const [signPdf, setSignPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [warming, setWarming] = useState(false);
  const [useWarmup, setUseWarmup] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SpeedTestResponse | null>(null);
  const [selectedMode, setSelectedMode] = useState<SpeedTestMode>('aggressive_plus');
  const [previewDims, setPreviewDims] = useState<{ width: number; height: number } | null>(null);

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
    setSignPdf(event.target.files?.[0] ?? null);
    setResult(null);
    setErrorMessage(null);
    setPreviewDims(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!signPdf) {
      setErrorMessage('전자본인서명확인서 파일을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);
      if (useWarmup) {
        await warmupProcessor();
      }
      const formData = new FormData();
      formData.append('signPdf', signPdf);
      formData.append('mode', selectedMode);

      const response = await fetch(`${getApiBaseUrl()}/verification/speed-test/${testId}`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as SpeedTestResponse | {
        message?: string | string[];
      };

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '속도 테스트 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setResult(data as SpeedTestResponse);
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
        { label: '회원이름', data: result.parsed.principalName },
        { label: '용도-법원명', data: result.parsed.purposeCourtName },
        { label: '용도-사건번호', data: result.parsed.caseNumber },
        { label: '용도-물건명', data: result.parsed.itemName },
        { label: '제출기관명', data: result.parsed.submissionInstitution },
        { label: '대리인명', data: result.parsed.agentName },
      ]
    : [];

  const overlayBoxes: OverlayBox[] = result
    ? (() => {
        const firstEntityByType = (type: string) =>
          result.ocr.signPdfEntities.find((entity) => entity.type === type);
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

        const principalEntity = firstEntityByType('principalName');
        const agentEntity = firstEntityByType('agentName');
        const institutionEntity = firstEntityByType('submissionInstitution');
        const purposeEntity = firstEntityByType('purposeText');

        const rawTargets: RawOverlayTarget[] = [
          result.parsed.principalName.value
            ? {
                id: 'principalName',
                label: '회원이름',
                value: result.parsed.principalName.value,
                box: toBox(principalEntity),
              }
            : null,
          result.parsed.purposeCourtName.value
            ? {
                id: 'purposeText',
                label: '용도 purposeText',
                value: purposeEntity?.mentionText ?? result.parsed.purposeCourtName.value,
                box:
                  purposeEntity &&
                  typeof purposeEntity.left === 'number' &&
                  typeof purposeEntity.top === 'number' &&
                  typeof purposeEntity.right === 'number' &&
                  typeof purposeEntity.bottom === 'number'
                    ? {
                        left: purposeEntity.left,
                        top: purposeEntity.top,
                        right: purposeEntity.right,
                        bottom: purposeEntity.bottom,
                      }
                    : undefined,
              }
            : null,
          result.parsed.submissionInstitution.value
            ? {
                id: 'submissionInstitution',
                label: '제출기관명',
                value: result.parsed.submissionInstitution.value,
                box: toBox(institutionEntity),
              }
            : null,
          result.parsed.agentName.value
            ? {
                id: 'agentName',
                label: '대리인명',
                value: result.parsed.agentName.value,
                box: toBox(agentEntity),
              }
            : null,
        ].filter((item): item is RawOverlayTarget => item !== null);

        const coordinateWidth = Math.max(1, result.preview.coordinateSpace.width || 1);
        const coordinateHeight = Math.max(1, result.preview.coordinateSpace.height || 1);
        const globalOffsetXPct = -0.65;
        const globalOffsetYPct = -0.15;

        return rawTargets
          .filter((item) => item.box)
          .filter(
            (item, index, array) =>
              item.id !== 'purposeText' ||
              array.findIndex((candidate) => candidate.id === 'purposeText') === index,
          )
          .map((item) => {
            const box = item.box!;
            const baseLeftPct = (box.left / coordinateWidth) * 100;
            const baseTopPct = (box.top / coordinateHeight) * 100;
            const baseWidthPct = ((box.right - box.left) / coordinateWidth) * 100;
            const baseHeightPct = ((box.bottom - box.top) / coordinateHeight) * 100;
            const inflateX = Math.max(0.8, baseWidthPct * 0.12);
            const inflateY = Math.max(0.8, baseHeightPct * 0.32);
            const leftPct = Math.max(
              0,
              baseLeftPct - inflateX / 2 + globalOffsetXPct,
            );
            const topPct = Math.max(
              0,
              baseTopPct - inflateY / 2 + globalOffsetYPct,
            );
            const widthPct = Math.min(100 - leftPct, Math.max(1.6, baseWidthPct + inflateX));
            const heightPct = Math.min(100 - topPct, Math.max(2.2, baseHeightPct + inflateY));

            return {
              id: item.id,
              label: item.label,
              value: item.value,
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
          <h1>속도 테스트 {testId}</h1>
          <p className="description">
            `/speedTest/${testId}` 전용 화면입니다. 전자본인서명확인서만 업로드해서 OCR과 파싱 결과를
            바로 확인할 수 있습니다.
          </p>
          <div className="speed-test-meta">
            <div>
              <span>페이지</span>
              <strong>/speedTest/{testId}</strong>
            </div>
            <div>
              <span>API</span>
              <strong>/verification/speed-test/{testId}</strong>
            </div>
          </div>
        </section> */}

        <section className="speed-test-panel">
            <div className="page-actions">
            <Link href="/">메인 테스트 페이지로 돌아가기</Link>
          </div>
          <form className="upload-form" onSubmit={handleSubmit}>
            <label>
              <span>전자본인서명확인서 파일 업로드</span>
              <input type="file" onChange={handleFileChange} />
            </label>
            {/* <div className="speed-test-mode-row">
              {([
                {
                  key: 'custom',
                  label: 'Custom Processor',
                },
              
                {
                  key: 'aggressive',
                  label: 'Aggressive Resize',
                },
                {
                  key: 'aggressive_plus',
                  label: 'Aggressive+',
                },
                {
                  key: 'crop_top',
                  label: 'Crop Top',
                },
                {
                  key: 'fast_first',
                  label: 'Fast First',
                },
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
                전자본인서명확인서 warmup 사용
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
              <div>
                <span>OCR 라인 수</span>
                <strong>{result.ocr.signPdfLines.length}</strong>
              </div>
              <div>
                <span>엔티티 수</span>
                <strong>{result.ocr.signPdfEntities.length}</strong>
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
              <h2>최적화 정보</h2>
              <div className="speed-test-file-meta">
                <p>적용 여부: {result.optimization.applied ? 'Y' : 'N'}</p>
                <p>전략: {result.optimization.strategy}</p>
                <p>입력 MIME: {result.optimization.sourceMimeType}</p>
                <p>OCR MIME: {result.optimization.outputMimeType}</p>
                <p>
                  원본 크기: {result.optimization.originalBytes.toLocaleString()} bytes
                </p>
                <p>
                  OCR 입력 크기: {result.optimization.optimizedBytes.toLocaleString()} bytes
                </p>
              </div>
            </article> */}

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
                    alt="전자본인서명확인서 미리보기"
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
              {result.ocr.signPdfOcrError ? (
                <p className="error-message">OCR 오류: {result.ocr.signPdfOcrError}</p>
              ) : (
                <pre className="speed-test-pre">{result.ocr.signPdfText || '(빈 텍스트)'}</pre>
              )}
            </article>

            <article className="speed-test-card">
              <h2>OCR 엔티티</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.signPdfEntities, null, 2)}
              </pre>
            </article>

            <article className="speed-test-card">
              <h2>OCR Form Fields</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.signPdfFormFields, null, 2)}
              </pre>
            </article>

            <article className="speed-test-card">
              <h2>OCR 라인</h2>
              <pre className="speed-test-pre">
                {JSON.stringify(result.ocr.signPdfLines.slice(0, 80), null, 2)}
              </pre>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
