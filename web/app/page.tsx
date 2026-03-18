'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

type UploadResponse = {
  success: boolean;
  files: {
    signPdf: {
      originalname: string;
      mimetype: string;
      size: number;
    };
  };
  ocr: {
    signPdfText: string;
    signPdfFormFields: Array<{ name: string; value: string; confidence: number | null }>;
    signPdfEntities: Array<{ type: string; mentionText: string; confidence: number | null }>;
  };
  parsed: {
    memberName: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    usage: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    submitInstitution: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
    delegatedPerson: {
      value: string | null;
      confidence: number | null;
      needsReview: boolean;
    };
  };
};

export default function HomePage() {
  const [signPdf, setSignPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSignPdf(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    if (!signPdf) {
      setErrorMessage('signPdf 파일을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('signPdf', signPdf);

      const response = await fetch('http://localhost:4000/verification/upload', {
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
        <h1>전자본인서명확인서 파싱 테스트</h1>
        <p className="description">signPdf 업로드 후 4개 값만 추출합니다.</p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label>
            <span>signPdf (전자본인서명확인서 PDF)</span>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? '업로드 중...' : '업로드 실행'}
          </button>
        </form>

        {errorMessage && <p className="error-message">에러: {errorMessage}</p>}

        {result && (
          <>
            <section className="parsed-section">
              <h2>Parsed 결과</h2>
              <div className="parsed-grid">
                <article className="card">
                  <h3>성명</h3>
                  <p>{result.parsed.memberName.value ?? '-'}</p>
                  <p>confidence: {result.parsed.memberName.confidence ?? '-'}</p>
                  <p>검토필요: {result.parsed.memberName.needsReview ? 'Y' : 'N'}</p>
                </article>
                <article className="card">
                  <h3>용도</h3>
                  <p>{result.parsed.usage.value ?? '-'}</p>
                  <p>confidence: {result.parsed.usage.confidence ?? '-'}</p>
                  <p>검토필요: {result.parsed.usage.needsReview ? 'Y' : 'N'}</p>
                </article>
                <article className="card">
                  <h3>전자본인서명확인서 제출기관</h3>
                  <p>{result.parsed.submitInstitution.value ?? '-'}</p>
                  <p>confidence: {result.parsed.submitInstitution.confidence ?? '-'}</p>
                  <p>검토필요: {result.parsed.submitInstitution.needsReview ? 'Y' : 'N'}</p>
                </article>
                <article className="card">
                  <h3>위임받은 사람</h3>
                  <p>{result.parsed.delegatedPerson.value ?? '-'}</p>
                  <p>confidence: {result.parsed.delegatedPerson.confidence ?? '-'}</p>
                  <p>검토필요: {result.parsed.delegatedPerson.needsReview ? 'Y' : 'N'}</p>
                </article>
              </div>
            </section>

            <section className="json-section">
              <h2>API 응답 JSON</h2>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
