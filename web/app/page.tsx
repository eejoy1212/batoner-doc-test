'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

type UploadResponse = {
  success: boolean;
  files: {
    signPdf: {
      originalname: string;
      mimetype: string;
      size: number;
    } | null;
    powerOfAttorneyImage: {
      originalname: string;
      mimetype: string;
      size: number;
    } | null;
    receiptImage: {
      originalname: string;
      mimetype: string;
      size: number;
    } | null;
    bidSheetImage: {
      originalname: string;
      mimetype: string;
      size: number;
    } | null;
  };
  ocr: {
    signPdfText: string;
    signPdfLines: Array<{
      text: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    signPdfFormFields: Array<{ name: string; value: string; confidence: number | null }>;
    signPdfEntities: Array<{ type: string; mentionText: string; confidence: number | null }>;
    signPdfOcrError: string | null;
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
    powerOfAttorneyImageEntities: Array<{
      type: string;
      mentionText: string;
      confidence: number | null;
    }>;
    powerOfAttorneyImageOcrError: string | null;
    receiptImageText: string;
    receiptImageLines: Array<{
      text: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    receiptImageFormFields: Array<{
      name: string;
      value: string;
      confidence: number | null;
    }>;
    receiptImageEntities: Array<{
      type: string;
      mentionText: string;
      confidence: number | null;
    }>;
    receiptImageOcrError: string | null;
    receiptImagePreprocessedImageBase64: string | null;
    receiptImagePreprocessedImageMimeType: string | null;
    receiptImagePreprocessAngle: number | null;
    receiptImagePreprocessShear: number | null;
    receiptImagePreprocessCropApplied: boolean;
    bidSheetImageText: string;
    bidSheetImageLines: Array<{
      text: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    bidSheetImageFormFields: Array<{
      name: string;
      value: string;
      confidence: number | null;
    }>;
    bidSheetImageEntities: Array<{
      type: string;
      mentionText: string;
      confidence: number | null;
    }>;
    bidSheetImageOcrError: string | null;
  };
  parsed: {
    principalName: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    agentName: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    submissionInstitution: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    purposeCourtName: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    caseNumber: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    itemName: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
  };
  lowConfidenceWarning: {
    receiptCaseNumber: boolean;
    receiptItemNumber: boolean;
  };
};

export default function HomePage() {
  const [signPdf, setSignPdf] = useState<File | null>(null);
  const [powerOfAttorneyImage, setPowerOfAttorneyImage] = useState<File | null>(null);
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [bidSheetImage, setBidSheetImage] = useState<File | null>(null);
  const [applyReceiptPreprocess, setApplyReceiptPreprocess] = useState(false);
  const [receiptImagePreviewUrl, setReceiptImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  useEffect(() => {
    if (!receiptImage) {
      setReceiptImagePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(receiptImage);
    setReceiptImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [receiptImage]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSignPdf(event.target.files?.[0] ?? null);
  };

  const handlePowerOfAttorneyImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPowerOfAttorneyImage(event.target.files?.[0] ?? null);
  };

  const handleReceiptImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReceiptImage(event.target.files?.[0] ?? null);
  };

  const handleBidSheetImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBidSheetImage(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!signPdf && !powerOfAttorneyImage && !receiptImage && !bidSheetImage) {
      setErrorMessage(
        'signPdf 또는 powerOfAttorneyImage 또는 receiptImage 또는 bidSheetImage 파일을 선택해주세요.',
      );
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      if (signPdf) {
        formData.append('signPdf', signPdf);
      }
      if (powerOfAttorneyImage) {
        formData.append('powerOfAttorneyImage', powerOfAttorneyImage);
      }
      if (receiptImage) {
        formData.append('receiptImage', receiptImage);
      }
      if (bidSheetImage) {
        formData.append('bidSheetImage', bidSheetImage);
      }
      formData.append(
        'applyReceiptPreprocess',
        applyReceiptPreprocess ? 'true' : 'false',
      );

      const response = await fetch(`${getApiBaseUrl()}/verification/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '업로드 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setResult(data as UploadResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap">
      <main className="container">
        <h1>문서 파싱 테스트</h1>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label>
            <span>powerOfAttorneyImage (위임장 이미지, 선택)</span>
            <input
              type="file"
              accept="image/*"
              onChange={handlePowerOfAttorneyImageChange}
            />
          </label>
          <label>
            <span>receiptImage (영수증 이미지, 선택)</span>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input type="file" accept="image/*" onChange={handleReceiptImageChange} />
              <button
                type="button"
                onClick={() => setApplyReceiptPreprocess((prev) => !prev)}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  background: applyReceiptPreprocess ? '#0f766e' : '#ffffff',
                  color: applyReceiptPreprocess ? '#ffffff' : '#111827',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                이미지 보정해서 올리기 {applyReceiptPreprocess ? 'ON' : 'OFF'}
              </button>
            </div>
          </label>
          <label>
            <span>signPdf (전자본인서명확인서 파일, 선택)</span>
            <input type="file" onChange={handleFileChange} />
          </label>
          <label>
            <span>bidSheetImage (기일입찰표 이미지, 선택)</span>
            <input type="file" accept="image/*" onChange={handleBidSheetImageChange} />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? '업로드 중...' : '업로드 실행'}
          </button>
        </form>

        {errorMessage && <p className="error-message">에러: {errorMessage}</p>}

        {result && (
          <>
            {(result.lowConfidenceWarning.receiptCaseNumber ||
              result.lowConfidenceWarning.receiptItemNumber) && (
              <p className="error-message">
                저신뢰 경고:
                {result.lowConfidenceWarning.receiptCaseNumber
                  ? ' 사건번호 confidence 낮음'
                  : ''}
                {result.lowConfidenceWarning.receiptItemNumber
                  ? ' 물건번호 confidence 낮음'
                  : ''}
              </p>
            )}
            {(() => {
              const isPowerOfAttorneyOnly = Boolean(
                result.files.powerOfAttorneyImage &&
                  !result.files.signPdf &&
                  !result.files.receiptImage &&
                  !result.files.bidSheetImage,
              );
              const isReceiptOnly = Boolean(
                result.files.receiptImage &&
                  !result.files.signPdf &&
                  !result.files.powerOfAttorneyImage &&
                  !result.files.bidSheetImage,
              );
              const isBidSheetOnly = Boolean(
                result.files.bidSheetImage &&
                  !result.files.signPdf &&
                  !result.files.powerOfAttorneyImage &&
                  !result.files.receiptImage,
              );
              return (
                <>
                  <section className="parsed-section">
                    <h2>추출된 결과</h2>
                    <div className="parsed-grid">
                      {isReceiptOnly || isBidSheetOnly ? (
                        <>
                          <article className="card">
                            <h3>사건번호</h3>
                            <p>{result.parsed.caseNumber.value ?? '-'}</p>
                            <p>confidence: {result.parsed.caseNumber.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.caseNumber.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>물건번호</h3>
                            <p>{result.parsed.itemName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.itemName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.itemName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                        </>
                      ) : isPowerOfAttorneyOnly ? (
                        <>
                          <article className="card">
                            <h3>입찰인 이름</h3>
                            <p>{result.parsed.principalName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.principalName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.principalName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>사건번호</h3>
                            <p>{result.parsed.caseNumber.value ?? '-'}</p>
                            <p>confidence: {result.parsed.caseNumber.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.caseNumber.needsReview ? 'Y' : 'N'}</p>
                          </article>
                        </>
                      ) : (
                        <>
                          <article className="card">
                            <h3>회원이름</h3>
                            <p>{result.parsed.principalName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.principalName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.principalName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>용도 - 법원명</h3>
                            <p>{result.parsed.purposeCourtName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.purposeCourtName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.purposeCourtName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>용도 - 사건번호</h3>
                            <p>{result.parsed.caseNumber.value ?? '-'}</p>
                            <p>confidence: {result.parsed.caseNumber.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.caseNumber.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>용도 - 물건명</h3>
                            <p>{result.parsed.itemName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.itemName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.itemName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>제출기관명</h3>
                            <p>{result.parsed.submissionInstitution.value ?? '-'}</p>
                            <p>confidence: {result.parsed.submissionInstitution.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.submissionInstitution.needsReview ? 'Y' : 'N'}</p>
                          </article>
                          <article className="card">
                            <h3>대리인명</h3>
                            <p>{result.parsed.agentName.value ?? '-'}</p>
                            <p>confidence: {result.parsed.agentName.confidence ?? '-'}</p>
                            <p>검토필요: {result.parsed.agentName.needsReview ? 'Y' : 'N'}</p>
                          </article>
                        </>
                      )}
                    </div>
                  </section>
                </>
              );
            })()}

            <section className="json-section">
              <h2>OCR 추출값</h2>
              <p>텍스트 길이: {result.ocr.signPdfText.length}</p>
              <pre>{result.ocr.signPdfText || '(빈 텍스트)'}</pre>
              <p>라인 수: {result.ocr.signPdfLines.length}</p>
              <pre>
                {JSON.stringify(
                  result.ocr.signPdfLines.slice(0, 30).map((line) => ({
                    text: line.text,
                    left: Number(line.left.toFixed(2)),
                    top: Number(line.top.toFixed(2)),
                    right: Number(line.right.toFixed(2)),
                    bottom: Number(line.bottom.toFixed(2)),
                  })),
                  null,
                  2,
                )}
              </pre>
              <p>위임장 텍스트 길이: {result.ocr.powerOfAttorneyImageText.length}</p>
              <pre>{result.ocr.powerOfAttorneyImageText || '(빈 텍스트)'}</pre>
              <p>영수증 텍스트 길이: {result.ocr.receiptImageText.length}</p>
              <pre>{result.ocr.receiptImageText || '(빈 텍스트)'}</pre>
              <p>기일입찰표 텍스트 길이: {result.ocr.bidSheetImageText.length}</p>
              <pre>{result.ocr.bidSheetImageText || '(빈 텍스트)'}</pre>
            </section>

            {(receiptImagePreviewUrl ||
              (result.ocr.receiptImagePreprocessedImageBase64 &&
                result.ocr.receiptImagePreprocessedImageMimeType)) && (
              <section className="parsed-section">
                <h2>영수증 이미지 비교</h2>
                {result.ocr.receiptImagePreprocessAngle !== null && (
                  <p style={{ margin: '0 0 10px', color: '#4b5563' }}>
                    전처리 자동 보정 각도: {result.ocr.receiptImagePreprocessAngle.toFixed(1)}도
                  </p>
                )}
                <p style={{ margin: '0 0 10px', color: '#4b5563' }}>
                  문서 영역 crop 적용: {result.ocr.receiptImagePreprocessCropApplied ? 'Y' : 'N'}
                  {' / '}
                  원근(유사 shear) 보정: {result.ocr.receiptImagePreprocessShear?.toFixed(4) ?? '0.0000'}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  }}
                >
                  <div>
                    <p style={{ margin: '0 0 8px', fontWeight: 700 }}>원본</p>
                    {receiptImagePreviewUrl ? (
                      <img
                        src={receiptImagePreviewUrl}
                        alt="receipt original preview"
                        style={{
                          width: '100%',
                          border: '1px solid #d1d5db',
                          borderRadius: '12px',
                          background: '#fff',
                        }}
                      />
                    ) : (
                      <p style={{ margin: 0, color: '#6b7280' }}>원본 미리보기를 찾을 수 없습니다.</p>
                    )}
                  </div>
                  <div>
                    <p style={{ margin: '0 0 8px', fontWeight: 700 }}>전처리</p>
                    {result.ocr.receiptImagePreprocessedImageBase64 &&
                    result.ocr.receiptImagePreprocessedImageMimeType ? (
                      <img
                        src={`data:${result.ocr.receiptImagePreprocessedImageMimeType};base64,${result.ocr.receiptImagePreprocessedImageBase64}`}
                        alt="receipt preprocessed preview"
                        style={{
                          width: '100%',
                          border: '1px solid #d1d5db',
                          borderRadius: '12px',
                          background: '#fff',
                        }}
                      />
                    ) : (
                      <p style={{ margin: 0, color: '#6b7280' }}>전처리 이미지가 없습니다.</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="json-section">
              <h2>API 응답 JSON</h2>
              {result.ocr.signPdfOcrError && (
                <p className="error-message">OCR 오류: {result.ocr.signPdfOcrError}</p>
              )}
              {result.ocr.powerOfAttorneyImageOcrError && (
                <p className="error-message">
                  위임장 OCR 오류: {result.ocr.powerOfAttorneyImageOcrError}
                </p>
              )}
              {result.ocr.receiptImageOcrError && (
                <p className="error-message">
                  영수증 OCR 오류: {result.ocr.receiptImageOcrError}
                </p>
              )}
              {result.ocr.bidSheetImageOcrError && (
                <p className="error-message">
                  기일입찰표 OCR 오류: {result.ocr.bidSheetImageOcrError}
                </p>
              )}
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
