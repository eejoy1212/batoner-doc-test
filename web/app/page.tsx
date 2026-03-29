'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';
import { useRouter } from 'next/navigation';

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
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
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
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
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
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
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

type DocumentTab =
  | 'all'
  | 'signPdf'
  | 'powerOfAttorneyImage'
  | 'receiptImage'
  | 'bidSheetImage';

type OverlayDocKey =
  | 'signPdf'
  | 'powerOfAttorneyImage'
  | 'receiptImage'
  | 'bidSheetImage';

type ReviewTarget = {
  id: string;
  label: string;
  value: string;
  box?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
};

type OcrFormFieldLike = { name: string; value: string; confidence: number | null };
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

type LoadingPhase = {
  title: string;
  description: string;
  buttonLabel: string;
};

const PROCESSING_DIALOG_DELAY_MS = 1000;

function getLoadingPhase(elapsedSeconds: number): LoadingPhase {
  if (elapsedSeconds < 2) {
    return {
      title: '업로드 중입니다',
      description: '선택한 파일을 서버로 보내고 있어요.',
      buttonLabel: '업로드 중...',
    };
  }
  if (elapsedSeconds < 8) {
    return {
      title: 'OCR 분석 중입니다',
      description: '문서에서 텍스트와 항목을 읽고 있어요.',
      buttonLabel: 'OCR 분석 중...',
    };
  }
  return {
    title: '결과 정리 중입니다',
    description: '추출된 값을 정리하고 응답을 마무리하고 있어요.',
    buttonLabel: '결과 정리 중...',
  };
}

function getFilesForActiveTab(params: {
  activeTab: DocumentTab;
  signPdf: File | null;
  powerOfAttorneyImage: File | null;
  receiptImage: File | null;
  bidSheetImage: File | null;
}): {
  signPdf: File | null;
  powerOfAttorneyImage: File | null;
  receiptImage: File | null;
  bidSheetImage: File | null;
} {
  const { activeTab, signPdf, powerOfAttorneyImage, receiptImage, bidSheetImage } =
    params;

  if (activeTab === 'signPdf') {
    return {
      signPdf,
      powerOfAttorneyImage: null,
      receiptImage: null,
      bidSheetImage: null,
    };
  }

  if (activeTab === 'powerOfAttorneyImage') {
    return {
      signPdf: null,
      powerOfAttorneyImage,
      receiptImage: null,
      bidSheetImage: null,
    };
  }

  if (activeTab === 'receiptImage') {
    return {
      signPdf: null,
      powerOfAttorneyImage: null,
      receiptImage,
      bidSheetImage: null,
    };
  }

  if (activeTab === 'bidSheetImage') {
    return {
      signPdf: null,
      powerOfAttorneyImage: null,
      receiptImage: null,
      bidSheetImage,
    };
  }

  return {
    signPdf,
    powerOfAttorneyImage,
    receiptImage,
    bidSheetImage,
  };
}

function normalizeForMatch(value: string): string {
  return (value ?? '').replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
}

function findLineForExtractedValue(
  lines: OcrLineLike[],
  extractedValue: string,
): OcrLineLike | null {
  const needle = normalizeForMatch(extractedValue);
  if (!needle || needle.length < 3) {
    return null;
  }

  let bestLine: OcrLineLike | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    const hay = normalizeForMatch(line.text);
    if (!hay) {
      continue;
    }

    let score = 0;
    if (hay.includes(needle) || needle.includes(hay)) {
      score += 100;
    }

    const overlap = [...needle].filter((ch) => hay.includes(ch)).length;
    score += overlap;

    if (/^\d+\/\d+$/.test((line.text ?? '').trim())) {
      score -= 120;
    }
    if (/^https?:\/\//i.test((line.text ?? '').trim())) {
      score -= 120;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  if (bestScore < 4) {
    return null;
  }
  return bestLine;
}

function findLineForCandidateValues(
  lines: OcrLineLike[],
  candidates: string[],
): OcrLineLike | null {
  const uniqueCandidates = Array.from(
    new Set(candidates.map((item) => item.trim()).filter((item) => item.length > 0)),
  );
  for (const candidate of uniqueCandidates) {
    const matched = findLineForExtractedValue(lines, candidate);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function findLineForItemNumberFallback(lines: OcrLineLike[], value: string): OcrLineLike | null {
  const raw = (value ?? '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    return null;
  }

  const isNormalized =
    lines.length > 0 &&
    Math.max(...lines.flatMap((line) => [line.left, line.top, line.right, line.bottom])) <= 2;
  const labelLines = lines.filter((line) => /물건\s*번?\s*호|물건/.test(line.text ?? ''));
  const valueRegex = new RegExp(`(^|\\D)${digits}(\\D|$)`);

  let bestLine: OcrLineLike | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const text = (line.text ?? '').trim();
    if (!text || /^\d+\/\d+$/.test(text) || /^https?:\/\//i.test(text)) {
      continue;
    }
    if (digits.length <= 2 && text.length > 32) {
      continue;
    }
    if (!valueRegex.test(text)) {
      continue;
    }

    let score = 10;
    if (/물건\s*번?\s*호|물건/.test(text)) {
      score += 9;
    }
    if (/^\d+$/.test(text)) {
      score += 3;
    }

    if (labelLines.length > 0) {
      const lineCenterY = (line.top + line.bottom) / 2;
      const nearestDistance = Math.min(
        ...labelLines.map((labelLine) =>
          Math.abs((labelLine.top + labelLine.bottom) / 2 - lineCenterY),
        ),
      );
      const threshold = isNormalized ? 0.08 : 120;
      if (nearestDistance <= threshold) {
        score += 8;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function findLineForItemNumberInBidSheet(
  lines: OcrLineLike[],
  value: string,
): OcrLineLike | null {
  const digits = (value ?? '').replace(/[^0-9]/g, '');
  if (!digits) {
    return null;
  }

  const isNormalized =
    lines.length > 0 &&
    Math.max(...lines.flatMap((line) => [line.left, line.top, line.right, line.bottom])) <= 2;
  const labelLines = lines.filter((line) => /물건\s*번?\s*호|물건/.test(line.text ?? ''));
  if (labelLines.length === 0) {
    return null;
  }

  const valueRegex = new RegExp(`(^|\\D)${digits}(\\D|$)`);
  const yThreshold = isNormalized ? 0.04 : 64;
  const xSlack = isNormalized ? 0.02 : 28;

  let bestLine: OcrLineLike | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    const text = (line.text ?? '').trim();
    if (!text || /^\d+\/\d+$/.test(text) || /^https?:\/\//i.test(text)) {
      continue;
    }
    if (text.length > 40) {
      continue;
    }
    if (!valueRegex.test(text)) {
      continue;
    }

    for (const label of labelLines) {
      const lineCenterY = (line.top + line.bottom) / 2;
      const labelCenterY = (label.top + label.bottom) / 2;
      const yDist = Math.abs(lineCenterY - labelCenterY);
      const xGap = line.left - label.right;
      const roughlySameRow = yDist <= yThreshold;
      const rightSide = xGap >= -xSlack;

      let score = 0;
      if (roughlySameRow) {
        score += 20;
      } else {
        score -= 25;
      }
      if (rightSide) {
        score += 12;
      } else {
        score -= 12;
      }
      if (/^\D*\d+\D*$/.test(text)) {
        score += 8;
      }
      score -= yDist * (isNormalized ? 60 : 0.08);
      score -= Math.abs(Math.max(0, xGap)) * (isNormalized ? 10 : 0.01);

      if (score > bestScore) {
        bestScore = score;
        bestLine = line;
      }
    }
  }

  return bestScore >= 0 ? bestLine : null;
}

function findLinesForCandidateValues(
  lines: OcrLineLike[],
  candidates: string[],
): OcrLineLike[] {
  const uniqueCandidates = Array.from(
    new Set(candidates.map((item) => item.trim()).filter((item) => item.length >= 3)),
  );
  if (uniqueCandidates.length === 0) {
    return [];
  }

  const matched: OcrLineLike[] = [];
  for (const line of lines) {
    const hay = normalizeForMatch(line.text);
    if (!hay || /^\d+\/\d+$/.test((line.text ?? '').trim()) || /^https?:\/\//i.test((line.text ?? '').trim())) {
      continue;
    }

    const hit = uniqueCandidates.some((candidate) => {
      const needle = normalizeForMatch(candidate);
      return needle.length >= 3 && (hay.includes(needle) || needle.includes(hay));
    });
    if (hit) {
      matched.push(line);
    }
  }
  return matched;
}

function unionLines(lines: OcrLineLike[]): OcrLineLike | null {
  if (lines.length === 0) {
    return null;
  }
  let left = lines[0].left;
  let top = lines[0].top;
  let right = lines[0].right;
  let bottom = lines[0].bottom;
  for (const line of lines.slice(1)) {
    left = Math.min(left, line.left);
    top = Math.min(top, line.top);
    right = Math.max(right, line.right);
    bottom = Math.max(bottom, line.bottom);
  }
  return {
    text: '',
    left,
    top,
    right,
    bottom,
  };
}

function expandPurposeTextCandidates(value: string): string[] {
  const base = (value ?? '').trim();
  if (!base) {
    return [];
  }

  const list = new Set<string>([base]);
  const paren = base.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (paren) {
    list.add(paren);
    const court = paren.match(/[가-힣\s]+(?:지방법원|고등법원|법원)(?:\s*[가-힣]+\s*(?:지원|본원))?/);
    if (court?.[0]) {
      list.add(court[0].trim());
    }
    const caseNo = paren.match(/[12]\d{3}\s*타\s*경\s*\d{3,}|[12]\d\s*\d\s*타\s*경\s*\d{3,}/);
    if (caseNo?.[0]) {
      list.add(caseNo[0].trim());
    }
    const itemNo = paren.match(/\[\s*\d{1,3}\s*\]/);
    // purposeText 박스는 문장/법원/사건번호 중심으로 잡고,
    // [1] 같은 짧은 토큰은 1/1 페이지 번호로 오매칭되기 쉬워서 제외한다.
    if (itemNo?.[0]) {
      // no-op
    }
  }

  return Array.from(list);
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

function narrowBoxToToken(line: OcrLineLike, tokenCandidates: string[]): OcrLineLike {
  const cleanLine = (line.text ?? '').replace(/\s+/g, '');
  if (!cleanLine) {
    return line;
  }

  const width = Math.max(1, line.right - line.left);
  for (const token of tokenCandidates) {
    const cleanToken = (token ?? '').replace(/\s+/g, '');
    if (!cleanToken || cleanToken.length < 2) {
      continue;
    }
    const idx = cleanLine.indexOf(cleanToken);
    if (idx < 0) {
      continue;
    }

    const startRatio = idx / cleanLine.length;
    const endRatio = (idx + cleanToken.length) / cleanLine.length;
    // 토큰 박스가 너무 타이트해지는 문제를 줄이기 위해 좌우 여유폭을 늘린다.
    const left = line.left + width * Math.max(0, startRatio - 0.09);
    const right = line.left + width * Math.min(1, endRatio + 0.1);
    return {
      ...line,
      left,
      right,
    };
  }
  return line;
}

function getOverlayGlobalOffset(docKey: OverlayDocKey): { xPct: number; yPct: number } {
  // 문서/좌표계별 전역 오프셋 보정값(%)
  if (docKey === 'signPdf') {
    return { xPct: 0.32, yPct: 0.24 };
  }
  if (docKey === 'receiptImage') {
    return { xPct: 0.12, yPct: 0.08 };
  }
  if (docKey === 'powerOfAttorneyImage') {
    return { xPct: 0.08, yPct: 0.06 };
  }
  if (docKey === 'bidSheetImage') {
    return { xPct: 0.08, yPct: 0.06 };
  }
  return { xPct: 0, yPct: 0 };
}

function getOverlayAnchorId(docKey: OverlayDocKey, targetId: string): string {
  // 전자본인서명확인서의 용도 하위 3개는 purposeText 박스 하나를 공유한다.
  if (
    docKey === 'signPdf' &&
    (targetId === 'purposeCourtName' || targetId === 'caseNumber' || targetId === 'itemName')
  ) {
    return 'purposeText';
  }
  return targetId;
}

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
  const [activeTab, setActiveTab] = useState<DocumentTab>('signPdf');
  const [reviewCheckedMap, setReviewCheckedMap] = useState<Record<string, boolean>>({});
  const [reviewConfirmedMap, setReviewConfirmedMap] = useState<Record<string, boolean>>({});
  const [isColdStartDialogOpen, setIsColdStartDialogOpen] = useState(false);
  const [coldStartStartedAt, setColdStartStartedAt] = useState<number | null>(null);
  const [coldStartElapsedSeconds, setColdStartElapsedSeconds] = useState(0);
  const router = useRouter();
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(() =>
    getLoadingPhase(0),
  );
  const [overlayImageDims, setOverlayImageDims] = useState<
    Partial<Record<OverlayDocKey, { width: number; height: number }>>
  >({});
  const [signPdfPreviewUrl, setSignPdfPreviewUrl] = useState<string | null>(null);
  const [powerOfAttorneyPreviewUrl, setPowerOfAttorneyPreviewUrl] = useState<string | null>(null);
  const [bidSheetPreviewUrl, setBidSheetPreviewUrl] = useState<string | null>(null);

  const resetTabValues = () => {
    setSignPdf(null);
    setPowerOfAttorneyImage(null);
    setReceiptImage(null);
    setBidSheetImage(null);
    setApplyReceiptPreprocess(false);
    setReceiptImagePreviewUrl(null);
    setSignPdfPreviewUrl(null);
    setPowerOfAttorneyPreviewUrl(null);
    setBidSheetPreviewUrl(null);
    setErrorMessage(null);
    setResult(null);
    setReviewCheckedMap({});
    setReviewConfirmedMap({});
    setOverlayImageDims({});
  };

  const runWithColdStartDialog = async <T,>(task: () => Promise<T>): Promise<T> => {
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();
    const dialogTimer = setTimeout(() => {
      setColdStartStartedAt(startedAt);
      setIsColdStartDialogOpen(true);
      setLoadingPhase(getLoadingPhase(0));
      elapsedTimer = setInterval(() => {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        setColdStartElapsedSeconds(elapsedSeconds);
        setLoadingPhase(getLoadingPhase(elapsedSeconds));
      }, 250);
    }, PROCESSING_DIALOG_DELAY_MS);

    try {
      return await task();
    } finally {
      clearTimeout(dialogTimer);
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
      }
      setIsColdStartDialogOpen(false);
      setColdStartStartedAt(null);
      setColdStartElapsedSeconds(0);
      setLoadingPhase(getLoadingPhase(0));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const runWarmup = async () => {
      try {
        await fetch(`${getApiBaseUrl()}/verification/warmup`, {
          method: 'POST',
          cache: 'no-store',
        });
      } catch {
        // warmup 실패는 사용자 흐름을 막지 않는다.
      }
    };

    if (!cancelled) {
      void runWarmup();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!receiptImage) {
      setReceiptImagePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(receiptImage);
    setReceiptImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [receiptImage]);

  useEffect(() => {
    if (!signPdf || !signPdf.type.startsWith('image/')) {
      setSignPdfPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(signPdf);
    setSignPdfPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [signPdf]);

  useEffect(() => {
    if (!powerOfAttorneyImage) {
      setPowerOfAttorneyPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(powerOfAttorneyImage);
    setPowerOfAttorneyPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [powerOfAttorneyImage]);

  useEffect(() => {
    if (!bidSheetImage) {
      setBidSheetPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(bidSheetImage);
    setBidSheetPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [bidSheetImage]);

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

  const toggleReviewed = (key: string, checked: boolean) => {
    setReviewCheckedMap((prev) => ({ ...prev, [key]: checked }));
  };

  const toggleConfirmed = (key: string, checked: boolean) => {
    setReviewConfirmedMap((prev) => ({ ...prev, [key]: checked }));
  };

  const getReviewTargets = (docKey: OverlayDocKey): ReviewTarget[] => {
    if (!result) {
      return [];
    }

    if (docKey === 'signPdf') {
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
      const caseEntity = firstEntityByType('caseNumber');
      const purposeText = purposeEntity?.mentionText ?? '';
      const purposeCourtValue = result.parsed.purposeCourtName.value;
      const purposeCaseValue = result.parsed.caseNumber.value;
      const purposeItemValue = result.parsed.itemName.value;

      const purposeCourtBox = projectEntitySubBox(purposeEntity, [
        purposeCourtValue,
        extractPurposeCourtFromText(purposeText),
      ]);
      const purposeCaseBox = projectEntitySubBox(purposeEntity, [
        purposeCaseValue,
        extractPurposeCaseNumberFromText(purposeText),
      ]);
      const purposeItemBox = projectEntitySubBox(purposeEntity, [
        purposeItemValue,
        extractPurposeItemNumberFromText(purposeText),
      ]);

      const list: Array<ReviewTarget | null> = [
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
              id: 'purposeCourtName',
              label: '용도-법원명',
              value: result.parsed.purposeCourtName.value,
              box: purposeCourtBox,
            }
          : null,
        result.parsed.caseNumber.value
          ? {
              id: 'caseNumber',
              label: '용도-사건번호',
              value: result.parsed.caseNumber.value,
              box: purposeCaseBox ?? toBox(caseEntity),
            }
          : null,
        result.parsed.itemName.value
          ? {
              id: 'itemName',
              label: '용도-물건명',
              value: result.parsed.itemName.value,
              box: purposeItemBox,
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
      ];

      // 용도 원문 박스는 제거하고, 용도 하위 3개만 박싱한다.
      // 단, 후보 추출을 위해 purposeText 원문은 이후 매칭 단계에서 사용한다.
      if (purposeText.trim().length > 0) {
        void purposeText;
      }

      return list.filter((item): item is ReviewTarget => item !== null);
    }

    if (docKey === 'powerOfAttorneyImage') {
      const firstEntityByTypes = (types: string[]) =>
        result.ocr.powerOfAttorneyImageEntities.find((entity) =>
          types.some((type) => normalizeForMatch(entity.type).includes(normalizeForMatch(type))),
        );
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

      const list: Array<{
        id: string;
        label: string;
        value: string | null;
        box?: { left: number; top: number; right: number; bottom: number };
      }> = [
        {
          id: 'principalName',
          label: '입찰인 이름',
          value: result.parsed.principalName.value,
          box: toBox(firstEntityByTypes(['bidderName', 'principalName'])),
        },
        {
          id: 'caseNumber',
          label: '사건번호',
          value: result.parsed.caseNumber.value,
          box: toBox(firstEntityByTypes(['caseNumber'])),
        },
      ];
      return list
        .filter((item) => (item.value ?? '').trim().length > 0)
        .map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value!,
          box: item.box,
        }));
    }

    const sourceEntities =
      docKey === 'receiptImage'
        ? result.ocr.receiptImageEntities
        : result.ocr.bidSheetImageEntities;
    const firstEntityByTypes = (types: string[]) =>
      sourceEntities.find((entity) =>
        types.some((type) => normalizeForMatch(entity.type).includes(normalizeForMatch(type))),
      );
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

    const list: Array<{
      id: string;
      label: string;
      value: string | null;
      box?: { left: number; top: number; right: number; bottom: number };
    }> = [
      {
        id: 'caseNumber',
        label: '사건번호',
        value: result.parsed.caseNumber.value,
        box: toBox(firstEntityByTypes(['caseNumber'])),
      },
      {
        id: 'itemNumber',
        label: '물건번호',
        value: result.parsed.itemName.value,
        box: toBox(firstEntityByTypes(['itemNumber', 'itemName'])),
      },
    ];
    return list
      .filter((item) => (item.value ?? '').trim().length > 0)
      .map((item) => ({
        id: item.id,
        label: item.label,
        value: item.value!,
        box: item.box,
      }));
  };

  const getEntityMentions = (entities: OcrEntityLike[], types: string[]) => {
    const normalizedTypes = types.map((item) => normalizeForMatch(item));
    return entities
      .filter((entity) =>
        normalizedTypes.some((t) => normalizeForMatch(entity.type).includes(t)),
      )
      .map((entity) => entity.mentionText)
      .filter((item) => (item ?? '').trim().length > 0);
  };

  const getFormFieldValues = (fields: OcrFormFieldLike[], labels: string[]) => {
    const normalizedLabels = labels.map((item) => normalizeForMatch(item));
    return fields
      .filter((field) =>
        normalizedLabels.some((label) => normalizeForMatch(field.name).includes(label)),
      )
      .map((field) => field.value)
      .filter((item) => (item ?? '').trim().length > 0);
  };

  const getReviewSourceCandidates = (
    doc: {
      key: OverlayDocKey;
      entities: OcrEntityLike[];
      formFields: OcrFormFieldLike[];
    },
    target: ReviewTarget,
  ) => {
    const base = [target.value];
    if (doc.key === 'signPdf') {
      if (target.id.startsWith('principalName')) {
        return [
          ...base,
          ...getEntityMentions(doc.entities, ['principalName', 'name']),
          ...getFormFieldValues(doc.formFields, ['성명']),
        ];
      }
      if (target.id.startsWith('purposeText')) {
        return [
          ...expandPurposeTextCandidates(target.value),
          ...getEntityMentions(doc.entities, ['purposeText']),
          ...getEntityMentions(doc.entities, ['purposeCourtName']),
          ...getFormFieldValues(doc.formFields, ['용도', '목적']),
        ];
      }
      if (target.id.startsWith('purposeCourtName')) {
        const purposeCandidates = getEntityMentions(doc.entities, ['purposeText'])
          .map((text) => extractPurposeCourtFromText(text))
          .filter((item): item is string => Boolean(item));
        return [
          ...base,
          ...purposeCandidates,
          ...getEntityMentions(doc.entities, ['purposeCourtName']),
        ];
      }
      if (target.id.startsWith('caseNumber')) {
        const purposeCaseCandidates = getEntityMentions(doc.entities, ['purposeText'])
          .map((text) => extractPurposeCaseNumberFromText(text))
          .filter((item): item is string => Boolean(item));
        return [
          ...base,
          ...purposeCaseCandidates,
          ...getEntityMentions(doc.entities, ['caseNumber']),
          ...getFormFieldValues(doc.formFields, ['사건번호']),
        ];
      }
      if (target.id.startsWith('itemName')) {
        const purposeItemCandidates = getEntityMentions(doc.entities, ['purposeText'])
          .map((text) => extractPurposeItemNumberFromText(text))
          .filter((item): item is string => Boolean(item));
        return [
          ...base,
          ...purposeItemCandidates,
          ...getEntityMentions(doc.entities, ['itemName', 'itemNumber']),
          ...getFormFieldValues(doc.formFields, ['물건번호', '물건명']),
        ];
      }
      if (target.id.startsWith('submissionInstitution')) {
        return [
          ...base,
          ...getEntityMentions(doc.entities, ['submissionInstitution', 'institution']),
          ...getFormFieldValues(doc.formFields, ['제출기관']),
        ];
      }
      if (target.id.startsWith('agentName')) {
        return [
          ...base,
          ...getEntityMentions(doc.entities, ['agentName', 'delegatedPerson']),
          ...getFormFieldValues(doc.formFields, ['대리인', '위임받은 사람']),
        ];
      }
    }

    if (doc.key === 'powerOfAttorneyImage') {
      if (target.id === 'principalName') {
        return [
          ...base,
          ...getEntityMentions(doc.entities, ['bidderName', 'principalName']),
          ...getFormFieldValues(doc.formFields, ['입찰인', '성명']),
        ];
      }
      if (target.id === 'caseNumber') {
        return [
          ...base,
          ...getEntityMentions(doc.entities, ['caseNumber']),
          ...getFormFieldValues(doc.formFields, ['사건번호']),
        ];
      }
    }

    if (target.id === 'caseNumber') {
      return [
        ...base,
        ...getEntityMentions(doc.entities, ['caseNumber']),
        ...getFormFieldValues(doc.formFields, ['사건번호']),
      ];
    }
    return [
      ...base,
      ...getEntityMentions(doc.entities, ['itemNumber', 'itemName', '물건번호']),
      ...getFormFieldValues(doc.formFields, ['물건번호', '물건 번호']),
    ];
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    const filesForUpload = getFilesForActiveTab({
      activeTab,
      signPdf,
      powerOfAttorneyImage,
      receiptImage,
      bidSheetImage,
    });

    if (
      !filesForUpload.signPdf &&
      !filesForUpload.powerOfAttorneyImage &&
      !filesForUpload.receiptImage &&
      !filesForUpload.bidSheetImage
    ) {
      setErrorMessage(
        'signPdf 또는 powerOfAttorneyImage 또는 receiptImage 또는 bidSheetImage 파일을 선택해주세요.',
      );
      return;
    }

    try {
      setLoading(true);
      setLoadingPhase({
        title: '업로드 준비 중입니다',
        description: '전송할 파일을 정리하고 있어요.',
        buttonLabel: '업로드 준비 중...',
      });

      const formData = new FormData();
      if (filesForUpload.signPdf) {
        formData.append('signPdf', filesForUpload.signPdf);
      }
      if (filesForUpload.powerOfAttorneyImage) {
        formData.append('powerOfAttorneyImage', filesForUpload.powerOfAttorneyImage);
      }
      if (filesForUpload.receiptImage) {
        formData.append('receiptImage', filesForUpload.receiptImage);
      }
      if (filesForUpload.bidSheetImage) {
        formData.append('bidSheetImage', filesForUpload.bidSheetImage);
      }
      formData.append(
        'applyReceiptPreprocess',
        applyReceiptPreprocess ? 'true' : 'false',
      );

      const { response, data } = await runWithColdStartDialog(async () => {
        const response = await fetch(`${getApiBaseUrl()}/verification/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        return { response, data };
      });

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
  
        {isColdStartDialogOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 9999,
              padding: '16px',
            }}
          >
            <section className="card" style={{ width: '100%', maxWidth: '560px' }}>
              <h2 style={{ marginTop: 0, marginBottom: '8px' }}>{loadingPhase.title}</h2>
              <p style={{ margin: '0 0 8px', color: '#374151' }}>
                {loadingPhase.description}
              </p>
              <p style={{ margin: 0, color: '#111827', fontWeight: 700 }}>
                대기 시간: {coldStartElapsedSeconds}초
                {coldStartStartedAt ? '' : ' (연결 확인 중)'}
              </p>
            </section>
          </div>
        )}
        <h1>문서 파싱 테스트 하러 가기</h1>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          {([
            // { key: 'all', label: '전체' },
            { key: 'signPdf', label: '전자본인서명확인서',url:"/ocr/1" },
            { key: 'powerOfAttorneyImage', label: '위임장' ,url:"/ocr/2"},
            { key: 'receiptImage', label: '영수증' ,url:"/ocr/3"},
            { key: 'bidSheetImage', label: '기일입찰표',url:"/ocr/4" },
          ] as Array<{ key: DocumentTab; label: string; url: string }>).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
              router.push(tab.url);
              }}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                padding: '8px 12px',
                background: '#111827',
                color:  '#ffffff' ,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

    
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
              const reviewDocs: Array<{
                key: OverlayDocKey;
                title: string;
                imageUrl: string | null;
                lines: OcrLineLike[];
                entities: OcrEntityLike[];
                formFields: OcrFormFieldLike[];
                coordinateSourceLabel: string;
              }> = [];

              if (activeTab === 'signPdf') {
                reviewDocs.push({
                  key: 'signPdf',
                  title: '전자본인서명확인서',
                  imageUrl: signPdfPreviewUrl,
                  lines: result.ocr.signPdfLines,
                  entities: result.ocr.signPdfEntities,
                  formFields: result.ocr.signPdfFormFields,
                  coordinateSourceLabel: '원본 OCR 라인',
                });
              }
              if (activeTab === 'powerOfAttorneyImage') {
                reviewDocs.push({
                  key: 'powerOfAttorneyImage',
                  title: '위임장',
                  imageUrl: powerOfAttorneyPreviewUrl,
                  lines: result.ocr.powerOfAttorneyImageLines,
                  entities: result.ocr.powerOfAttorneyImageEntities,
                  formFields: result.ocr.powerOfAttorneyImageFormFields,
                  coordinateSourceLabel: '원본 OCR 라인',
                });
              }
              if (activeTab === 'receiptImage') {
                const preprocessedReceiptImageUrl =
                  result.ocr.receiptImagePreprocessedImageBase64 &&
                  result.ocr.receiptImagePreprocessedImageMimeType
                    ? `data:${result.ocr.receiptImagePreprocessedImageMimeType};base64,${result.ocr.receiptImagePreprocessedImageBase64}`
                    : null;
                reviewDocs.push({
                  key: 'receiptImage',
                  title: '영수증',
                  imageUrl: preprocessedReceiptImageUrl ?? receiptImagePreviewUrl,
                  lines: result.ocr.receiptImageLines,
                  entities: result.ocr.receiptImageEntities,
                  formFields: result.ocr.receiptImageFormFields,
                  coordinateSourceLabel: preprocessedReceiptImageUrl
                    ? '전처리 OCR 라인'
                    : '원본 OCR 라인',
                });
              }
              if (activeTab === 'bidSheetImage') {
                reviewDocs.push({
                  key: 'bidSheetImage',
                  title: '기일입찰표',
                  imageUrl: bidSheetPreviewUrl,
                  lines: result.ocr.bidSheetImageLines,
                  entities: result.ocr.bidSheetImageEntities,
                  formFields: result.ocr.bidSheetImageFormFields,
                  coordinateSourceLabel: '원본 OCR 라인',
                });
              }

              const reviewDoc = reviewDocs[0] ?? null;
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
              const parsedView =
                activeTab === 'receiptImage'
                  ? 'receipt'
                  : activeTab === 'bidSheetImage'
                    ? 'bid'
                    : activeTab === 'powerOfAttorneyImage'
                      ? 'power'
                      : activeTab === 'signPdf'
                        ? 'sign'
                        : isReceiptOnly
                          ? 'receipt'
                          : isBidSheetOnly
                            ? 'bid'
                            : isPowerOfAttorneyOnly
                              ? 'power'
                              : 'sign';

              const parsedItems: Array<{
                id: string;
                label: string;
                value: string | null;
                confidence: number | null;
                needsReview: boolean;
              }> =
                parsedView === 'receipt' || parsedView === 'bid'
                  ? [
                      {
                        id: 'caseNumber',
                        label: '사건번호',
                        value: result.parsed.caseNumber.value,
                        confidence: result.parsed.caseNumber.confidence,
                        needsReview: result.parsed.caseNumber.needsReview,
                      },
                      {
                        id: 'itemNumber',
                        label: '물건번호',
                        value: result.parsed.itemName.value,
                        confidence: result.parsed.itemName.confidence,
                        needsReview: result.parsed.itemName.needsReview,
                      },
                    ]
                  : parsedView === 'power'
                    ? [
                        {
                          id: 'principalName',
                          label: '입찰인 이름',
                          value: result.parsed.principalName.value,
                          confidence: result.parsed.principalName.confidence,
                          needsReview: result.parsed.principalName.needsReview,
                        },
                        {
                          id: 'caseNumber',
                          label: '사건번호',
                          value: result.parsed.caseNumber.value,
                          confidence: result.parsed.caseNumber.confidence,
                          needsReview: result.parsed.caseNumber.needsReview,
                        },
                      ]
                    : [
                        {
                          id: 'principalName',
                          label: '회원이름',
                          value: result.parsed.principalName.value,
                          confidence: result.parsed.principalName.confidence,
                          needsReview: result.parsed.principalName.needsReview,
                        },
                        {
                          id: 'purposeCourtName',
                          label: '용도 - 법원명',
                          value: result.parsed.purposeCourtName.value,
                          confidence: result.parsed.purposeCourtName.confidence,
                          needsReview: result.parsed.purposeCourtName.needsReview,
                        },
                        {
                          id: 'caseNumber',
                          label: '용도 - 사건번호',
                          value: result.parsed.caseNumber.value,
                          confidence: result.parsed.caseNumber.confidence,
                          needsReview: result.parsed.caseNumber.needsReview,
                        },
                        {
                          id: 'itemName',
                          label: '용도 - 물건명',
                          value: result.parsed.itemName.value,
                          confidence: result.parsed.itemName.confidence,
                          needsReview: result.parsed.itemName.needsReview,
                        },
                        {
                          id: 'submissionInstitution',
                          label: '제출기관명',
                          value: result.parsed.submissionInstitution.value,
                          confidence: result.parsed.submissionInstitution.confidence,
                          needsReview: result.parsed.submissionInstitution.needsReview,
                        },
                        {
                          id: 'agentName',
                          label: '대리인명',
                          value: result.parsed.agentName.value,
                          confidence: result.parsed.agentName.confidence,
                          needsReview: result.parsed.agentName.needsReview,
                        },
                      ];

              const listItems = parsedItems.filter((item) => item.value);
              const targets = reviewDoc ? getReviewTargets(reviewDoc.key) : [];
              const hasImage = Boolean(reviewDoc?.imageUrl);
              const hasLines = (reviewDoc?.lines.length ?? 0) > 0;
              const isNormalized =
                hasLines &&
                Math.max(
                  ...(reviewDoc?.lines.flatMap((line) => [
                    line.left,
                    line.top,
                    line.right,
                    line.bottom,
                  ]) ?? [0]),
                ) <= 2;
              const maxLineRight = hasLines
                ? Math.max(...(reviewDoc?.lines.map((line) => line.right) ?? [0]))
                : 0;
              const maxLineBottom = hasLines
                ? Math.max(...(reviewDoc?.lines.map((line) => line.bottom) ?? [0]))
                : 0;
              const imageDims = reviewDoc ? overlayImageDims[reviewDoc.key] : undefined;
              const docWidth = isNormalized
                ? 1
                : Math.max(imageDims?.width ?? maxLineRight, 1);
              const docHeight = isNormalized
                ? 1
                : Math.max(imageDims?.height ?? maxLineBottom, 1);
              const globalOffset = reviewDoc
                ? getOverlayGlobalOffset(reviewDoc.key)
                : { xPct: 0, yPct: 0 };

              const placements = targets
                .map((target) => {
                  if (!reviewDoc) {
                    return null;
                  }
                  const overlayAnchorId = getOverlayAnchorId(reviewDoc.key, target.id);
                  const isPurposeAnchor =
                    reviewDoc.key === 'signPdf' && overlayAnchorId === 'purposeText';
                  const candidates = isPurposeAnchor
                    ? [
                        ...getEntityMentions(reviewDoc.entities, ['purposeText']),
                        ...getFormFieldValues(reviewDoc.formFields, ['용도', '목적']),
                      ]
                    : getReviewSourceCandidates(reviewDoc, target);
                  const mergedForPurpose = isPurposeAnchor
                    ? unionLines(findLinesForCandidateValues(reviewDoc.lines, candidates))
                    : null;
                  const purposeEntity = isPurposeAnchor
                    ? reviewDoc.entities.find((entity) =>
                        normalizeForMatch(entity.type).includes('purposetext'),
                      )
                    : undefined;
                  const purposeEntityLine =
                    purposeEntity &&
                    typeof purposeEntity.left === 'number' &&
                    typeof purposeEntity.top === 'number' &&
                    typeof purposeEntity.right === 'number' &&
                    typeof purposeEntity.bottom === 'number'
                      ? {
                          text: purposeEntity.mentionText ?? '',
                          left: purposeEntity.left,
                          top: purposeEntity.top,
                          right: purposeEntity.right,
                          bottom: purposeEntity.bottom,
                        }
                      : null;
                  let matchedLine =
                    mergedForPurpose ?? findLineForCandidateValues(reviewDoc.lines, candidates);
                  if (!matchedLine && target.id === 'itemNumber') {
                    if (reviewDoc.key === 'bidSheetImage') {
                      matchedLine =
                        findLineForItemNumberInBidSheet(reviewDoc.lines, target.value) ??
                        findLineForItemNumberFallback(reviewDoc.lines, target.value);
                    } else if (reviewDoc.key === 'receiptImage') {
                      matchedLine = findLineForItemNumberFallback(
                        reviewDoc.lines,
                        target.value,
                      );
                    }
                  }
                  const entityFallbackLine = target.box
                    ? {
                        text: target.value,
                        left: target.box.left,
                        top: target.box.top,
                        right: target.box.right,
                        bottom: target.box.bottom,
                      }
                    : null;
                  // 좌표계 오프셋을 줄이기 위해 라인 매칭 좌표를 우선 사용하고,
                  // 매칭 실패 시에만 엔티티 박스 좌표를 보조로 사용한다.
                  const line = purposeEntityLine ?? matchedLine ?? entityFallbackLine;

                  if (!line) {
                    return null;
                  }

                  const narrowedLine =
                    !isPurposeAnchor &&
                    reviewDoc.key === 'signPdf' &&
                    (target.id.startsWith('purposeCourtName') ||
                      target.id.startsWith('caseNumber') ||
                      target.id.startsWith('itemName'))
                      ? narrowBoxToToken(line, candidates)
                      : line;

                  const baseWidth = isNormalized
                    ? (narrowedLine.right - narrowedLine.left) * 100
                    : ((narrowedLine.right - narrowedLine.left) / docWidth) * 100;
                  const baseHeight = isNormalized
                    ? (narrowedLine.bottom - narrowedLine.top) * 100
                    : ((narrowedLine.bottom - narrowedLine.top) / docHeight) * 100;
                  const baseLeftPct = isNormalized
                    ? narrowedLine.left * 100
                    : (narrowedLine.left / docWidth) * 100;
                  const baseTopPct = isNormalized
                    ? narrowedLine.top * 100
                    : (narrowedLine.top / docHeight) * 100;

                  // 박스 확장은 중심 기준으로만 늘려 방향성 오차(좌상단 쏠림)를 줄인다.
                  const inflateX = Math.max(0.9, baseWidth * 0.22);
                  const inflateY = Math.max(1.25, baseHeight * 0.5);
                  const leftPct = Math.max(
                    0,
                    baseLeftPct - inflateX / 2 + globalOffset.xPct,
                  );
                  const topPct = Math.max(
                    0,
                    baseTopPct - inflateY / 2 + globalOffset.yPct,
                  );
                  const widthPct = Math.min(
                    100 - leftPct,
                    Math.max(1.9, baseWidth + inflateX),
                  );
                  const heightPct = Math.min(
                    100 - topPct,
                    Math.max(2.9, baseHeight + inflateY),
                  );
                  const checkedKey = `${reviewDoc.key}:${overlayAnchorId}`;

                  return {
                    target,
                    checkedKey,
                    leftPct,
                    topPct,
                    widthPct,
                    heightPct,
                  };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);

              const selectedPlacements = placements.filter(
                (placement) => reviewCheckedMap[placement.checkedKey],
              );
              const dedupedSelectedPlacements = Array.from(
                new Map(selectedPlacements.map((placement) => [placement.checkedKey, placement]))
                  .values(),
              );
              const confirmedOverlayKeys = new Set<string>();
              if (reviewDoc) {
                const overlayToConfirmKeys = new Map<string, string[]>();
                for (const target of targets) {
                  const overlayAnchorId = getOverlayAnchorId(reviewDoc.key, target.id);
                  const overlayKey = `${reviewDoc.key}:${overlayAnchorId}`;
                  const confirmKey = `${reviewDoc.key}:${target.id}`;
                  const list = overlayToConfirmKeys.get(overlayKey) ?? [];
                  list.push(confirmKey);
                  overlayToConfirmKeys.set(overlayKey, list);
                }

                for (const [overlayKey, confirmKeys] of overlayToConfirmKeys) {
                  // 공유 박스(예: purposeText)는 연결된 모든 항목이 확인완료일 때만 초록 처리
                  const allConfirmed = confirmKeys.every((confirmKey) => reviewConfirmedMap[confirmKey]);
                  if (allConfirmed) {
                    confirmedOverlayKeys.add(overlayKey);
                  }
                }
              }

              return (
                <section className="parsed-section">
                  <div className="review-layout">
                    <article className="card">
                      <h2>추출된 결과</h2>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {listItems.map((item) => {
                          const checkedKey = reviewDoc
                            ? `${reviewDoc.key}:${getOverlayAnchorId(reviewDoc.key, item.id)}`
                            : item.id;
                          const isSelected = Boolean(reviewCheckedMap[checkedKey]);
                          const confirmKey = reviewDoc
                            ? `${reviewDoc.key}:${item.id}`
                            : item.id;
                          const isConfirmed = Boolean(reviewConfirmedMap[confirmKey]);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleReviewed(checkedKey, !isSelected)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                border: isSelected
                                  ? '2px solid #dc2626'
                                  : '1px solid #d1d5db',
                                borderRadius: '10px',
                                background: isSelected ? '#fef2f2' : '#ffffff',
                                padding: '10px 12px',
                                cursor: 'pointer',
                              }}
                            >
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  color: '#4b5563',
                                }}
                              >
                                {item.label}
                              </p>
                              <p style={{ margin: '4px 0 0', fontSize: '17px', fontWeight: 700 }}>
                                {item.value ?? '-'}
                              </p>
                              <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#6b7280' }}>
                                confidence: {item.confidence ?? '-'} / 검토필요:{' '}
                                {item.needsReview ? 'Y' : 'N'}
                              </p>
                              <label
                                onClick={(event) => event.stopPropagation()}
                                style={{
                                  marginTop: '8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '12px',
                                  color: '#111827',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isConfirmed}
                                  onChange={(event) =>
                                    toggleConfirmed(confirmKey, event.target.checked)
                                  }
                                />
                                확인완료
                              </label>
                            </button>
                          );
                        })}
                      </div>
                    </article>

                    <article className="card">
                      <h2>추출 위치 확인</h2>
                      <h3 style={{ marginTop: 0 }}>{reviewDoc?.title ?? '-'}</h3>
                      <p style={{ marginTop: 0, color: '#4b5563' }}>
                        박스 좌표 기준: {reviewDoc?.coordinateSourceLabel ?? '-'}
                      </p>
                      {!hasImage && (
                        <p style={{ color: '#6b7280' }}>
                          미리보기 이미지를 사용할 수 없습니다. (이미지 파일만 표시 가능)
                        </p>
                      )}
                      {hasImage && (
                        <div
                          style={{
                            position: 'relative',
                            border: '1px solid #d1d5db',
                            borderRadius: '10px',
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={reviewDoc?.imageUrl ?? ''}
                            alt={`${reviewDoc?.title ?? '문서'} preview`}
                            onLoad={(event) => {
                              if (!reviewDoc) {
                                return;
                              }
                              const { naturalWidth, naturalHeight } = event.currentTarget;
                              if (!naturalWidth || !naturalHeight) {
                                return;
                              }
                              setOverlayImageDims((prev) => {
                                const prevDims = prev[reviewDoc.key];
                                if (
                                  prevDims?.width === naturalWidth &&
                                  prevDims?.height === naturalHeight
                                ) {
                                  return prev;
                                }
                                return {
                                  ...prev,
                                  [reviewDoc.key]: {
                                    width: naturalWidth,
                                    height: naturalHeight,
                                  },
                                };
                              });
                            }}
                            style={{ width: '100%', display: 'block', borderRadius: '10px' }}
                          />
                          {dedupedSelectedPlacements.map((placement) => (
                            <div
                              key={placement.checkedKey}
                              style={{
                                position: 'absolute',
                                left: `${placement.leftPct}%`,
                                top: `${placement.topPct}%`,
                                width: `${placement.widthPct}%`,
                                height: `${placement.heightPct}%`,
                                border: confirmedOverlayKeys.has(placement.checkedKey)
                                  ? '2px solid #16a34a'
                                  : '2px solid #ef4444',
                                borderRadius: '2px',
                                boxSizing: 'border-box',
                                pointerEvents: 'none',
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {targets.length === 0 && (
                        <p style={{ color: '#6b7280', marginTop: '10px' }}>
                          표시할 추출 값이 없습니다.
                        </p>
                      )}
                    </article>
                  </div>
                </section>
              );
            })()}

            {/* <section className="json-section">
              <h2>OCR 추출값</h2>
              {(activeTab === 'all' || activeTab === 'signPdf') && (
                <>
                  <p>전자본인서명확인서 텍스트 길이: {result.ocr.signPdfText.length}</p>
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
                </>
              )}
              {(activeTab === 'all' || activeTab === 'powerOfAttorneyImage') && (
                <>
                  <p>위임장 텍스트 길이: {result.ocr.powerOfAttorneyImageText.length}</p>
                  <pre>{result.ocr.powerOfAttorneyImageText || '(빈 텍스트)'}</pre>
                </>
              )}
              {(activeTab === 'all' || activeTab === 'receiptImage') && (
                <>
                  <p>영수증 텍스트 길이: {result.ocr.receiptImageText.length}</p>
                  <pre>{result.ocr.receiptImageText || '(빈 텍스트)'}</pre>
                </>
              )}
              {(activeTab === 'all' || activeTab === 'bidSheetImage') && (
                <>
                  <p>기일입찰표 텍스트 길이: {result.ocr.bidSheetImageText.length}</p>
                  <pre>{result.ocr.bidSheetImageText || '(빈 텍스트)'}</pre>
                </>
              )}
            </section> */}

            {(activeTab === 'all' || activeTab === 'receiptImage') &&
              (receiptImagePreviewUrl ||
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

            {/* <section className="json-section">
              <h2>API 응답 JSON</h2>
              {(activeTab === 'all' || activeTab === 'signPdf') && result.ocr.signPdfOcrError && (
                <p className="error-message">OCR 오류: {result.ocr.signPdfOcrError}</p>
              )}
              {(activeTab === 'all' || activeTab === 'powerOfAttorneyImage') &&
                result.ocr.powerOfAttorneyImageOcrError && (
                <p className="error-message">
                  위임장 OCR 오류: {result.ocr.powerOfAttorneyImageOcrError}
                </p>
              )}
              {(activeTab === 'all' || activeTab === 'receiptImage') &&
                result.ocr.receiptImageOcrError && (
                <p className="error-message">
                  영수증 OCR 오류: {result.ocr.receiptImageOcrError}
                </p>
              )}
              {(activeTab === 'all' || activeTab === 'bidSheetImage') &&
                result.ocr.bidSheetImageOcrError && (
                <p className="error-message">
                  기일입찰표 OCR 오류: {result.ocr.bidSheetImageOcrError}
                </p>
              )}
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </section> */}
          </>
        )}
      </main>
    </div>
  );
}
