import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  OcrDetailedResult,
  OcrEngineService,
  OcrEntity,
  OcrFormField,
  OcrLine,
} from '../ocr/ocr-engine.service';
import {
  ParsedField,
  ParsedResult,
  UploadedFileMetadata,
} from '../types/verification.types';
import {
  VerificationSettings,
  VerificationSettingsService,
} from './verification-settings.service';

type ParsedFieldKey =
  | 'principalName'
  | 'purposeCourtName'
  | 'caseNumber'
  | 'itemName'
  | 'submissionInstitution'
  | 'agentName';

type ParsedCandidate = { value: string; confidence: number | null };
type ReceiptLowConfidenceWarning = {
  caseNumber: boolean;
  itemNumber: boolean;
};
type ReceiptOcrResult = {
  result: OcrDetailedResult;
  preprocessedImageBase64: string | null;
  preprocessedImageMimeType: string | null;
  preprocessAngle: number | null;
  preprocessShear: number | null;
  preprocessCropApplied: boolean;
};
type DocumentKind = 'signPdf' | 'powerOfAttorneyImage' | 'receiptImage' | 'bidSheetImage';

@Injectable()
export class VerificationService {
  constructor(
    private readonly ocrEngineService: OcrEngineService,
    private readonly verificationSettingsService: VerificationSettingsService,
  ) {}

  async processUpload(
    signPdf?: Express.Multer.File,
    powerOfAttorneyImage?: Express.Multer.File,
    receiptImage?: Express.Multer.File,
    bidSheetImage?: Express.Multer.File,
    applyReceiptPreprocess = false,
  ) {
    // 문서별 OCR은 독립적으로 수행하고, 파싱은 이후 문서 타입별 전용 함수로 분기한다.
    const signPdfOcr = signPdf
      ? await this.extractSignPdfOcr(signPdf)
      : {
          text: '',
          lines: [],
          formFields: [],
          entities: [],
          error: null,
        };

    const powerOfAttorneyOcr = powerOfAttorneyImage
      ? await this.extractImageOcr(powerOfAttorneyImage)
      : {
          text: '',
          lines: [],
          formFields: [],
          entities: [],
          error: null,
        };
    if (powerOfAttorneyImage) {
      console.log('위임장 ocr :', powerOfAttorneyOcr);
    }
    const receiptOcrWithDebug = receiptImage
      ? await this.extractReceiptOcr(receiptImage, applyReceiptPreprocess)
      : {
          result: {
            text: '',
            lines: [],
            formFields: [],
            entities: [],
            error: null,
          },
          preprocessedImageBase64: null,
          preprocessedImageMimeType: null,
          preprocessAngle: null,
          preprocessShear: null,
          preprocessCropApplied: false,
        };
    const receiptOcr = receiptOcrWithDebug.result;
    const bidSheetOcr = bidSheetImage
      ? await this.extractImageOcr(bidSheetImage)
      : {
          text: '',
          lines: [],
          formFields: [],
          entities: [],
          error: null,
        };
    const settings = await this.verificationSettingsService.getSettings();
    const primaryDocument = this.selectPrimaryDocumentKind({
      signPdf: Boolean(signPdf),
      powerOfAttorneyImage: Boolean(powerOfAttorneyImage),
      receiptImage: Boolean(receiptImage),
      bidSheetImage: Boolean(bidSheetImage),
    });

    let parsed: ParsedResult;
    let receiptLowConfidenceWarning: ReceiptLowConfidenceWarning = {
      caseNumber: false,
      itemNumber: false,
    };

    // 문서 종류별 전용 함수만 호출한다.
    if (primaryDocument === 'receiptImage') {
      const receiptParsed = this.parseReceiptFields(receiptOcr, settings.reviewThreshold);
      parsed = receiptParsed.parsed;
      receiptLowConfidenceWarning = receiptParsed.lowConfidenceWarning;
    } else if (primaryDocument === 'bidSheetImage') {
      parsed = this.parseBidSheetFields(bidSheetOcr, settings.reviewThreshold);
    } else if (primaryDocument === 'powerOfAttorneyImage') {
      parsed = this.parsePowerOfAttorneyFields(powerOfAttorneyOcr, settings.reviewThreshold);
    } else {
      parsed = this.parseSignPdfFields(signPdfOcr, settings);
    }

    if (primaryDocument === 'receiptImage') {
      this.logReceiptConfidenceDebug(receiptOcr, parsed);
    }

    return {
      success: true,
      files: {
        signPdf: signPdf ? this.toMetadata(signPdf) : null,
        powerOfAttorneyImage: powerOfAttorneyImage
          ? this.toMetadata(powerOfAttorneyImage)
          : null,
        receiptImage: receiptImage ? this.toMetadata(receiptImage) : null,
        bidSheetImage: bidSheetImage ? this.toMetadata(bidSheetImage) : null,
      },
      ocr: {
        signPdfText: signPdfOcr.text,
        signPdfLines: signPdfOcr.lines,
        signPdfFormFields: signPdfOcr.formFields,
        signPdfEntities: signPdfOcr.entities,
        signPdfOcrError: signPdfOcr.error,
        powerOfAttorneyImageText: powerOfAttorneyOcr.text,
        powerOfAttorneyImageLines: powerOfAttorneyOcr.lines,
        powerOfAttorneyImageFormFields: powerOfAttorneyOcr.formFields,
        powerOfAttorneyImageEntities: powerOfAttorneyOcr.entities,
        powerOfAttorneyImageOcrError: powerOfAttorneyOcr.error,
        receiptImageText: receiptOcr.text,
        receiptImageLines: receiptOcr.lines,
        receiptImageFormFields: receiptOcr.formFields,
        receiptImageEntities: receiptOcr.entities,
        receiptImageOcrError: receiptOcr.error,
        bidSheetImageText: bidSheetOcr.text,
        bidSheetImageLines: bidSheetOcr.lines,
        bidSheetImageFormFields: bidSheetOcr.formFields,
        bidSheetImageEntities: bidSheetOcr.entities,
        bidSheetImageOcrError: bidSheetOcr.error,
        receiptImagePreprocessedImageBase64:
          receiptOcrWithDebug.preprocessedImageBase64,
        receiptImagePreprocessedImageMimeType:
          receiptOcrWithDebug.preprocessedImageMimeType,
        receiptImagePreprocessAngle: receiptOcrWithDebug.preprocessAngle,
        receiptImagePreprocessShear: receiptOcrWithDebug.preprocessShear,
        receiptImagePreprocessCropApplied: receiptOcrWithDebug.preprocessCropApplied,
      },
      lowConfidenceWarning: {
        receiptCaseNumber: receiptLowConfidenceWarning.caseNumber,
        receiptItemNumber: receiptLowConfidenceWarning.itemNumber,
      },
      parsed,
    };
  }

  // 업로드된 파일 조합에서 파싱 기준이 될 문서 타입을 정한다.
  private selectPrimaryDocumentKind(files: {
    signPdf: boolean;
    powerOfAttorneyImage: boolean;
    receiptImage: boolean;
    bidSheetImage: boolean;
  }): DocumentKind {
    if (files.signPdf) {
      return 'signPdf';
    }
    if (files.powerOfAttorneyImage) {
      return 'powerOfAttorneyImage';
    }
    if (files.receiptImage) {
      return 'receiptImage';
    }
    return 'bidSheetImage';
  }

  // 기일입찰표 전용 파서: 사건번호/물건번호만 추출한다.
  private parseBidSheetFields(
    ocr: OcrDetailedResult,
    reviewThreshold: number,
  ): ParsedResult {
    const caseNumberCandidate =
      this.normalizeReceiptCaseNumberCandidate(
        this.findByEntity(ocr.entities, ['caseNumber', 'case_number', '사건번호']) ??
          this.findByFormField(ocr.formFields, ['사건번호', '사건 번호']) ??
          this.findReceiptCaseNumberByPattern(ocr),
      );
    const itemNumberCandidate =
      this.normalizeReceiptItemNumberCandidate(
        this.findByEntity(ocr.entities, ['itemNumber', 'item_number', '물건번호']) ??
          this.findByFormField(ocr.formFields, ['물건번호', '물건 번호']) ??
          this.findReceiptItemNumberByPattern(ocr),
      );

    return {
      principalName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      purposeCourtName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      caseNumber: this.toParsedField(caseNumberCandidate, reviewThreshold),
      itemName: this.toParsedField(itemNumberCandidate, reviewThreshold),
      submissionInstitution: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      agentName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
    };
  }

  // 영수증 전용 파서: 사건번호/물건번호를 추출하고 저신뢰 경고를 계산한다.
  private parseReceiptFields(
    ocr: OcrDetailedResult,
    reviewThreshold: number,
  ): {
    parsed: ParsedResult;
    lowConfidenceWarning: ReceiptLowConfidenceWarning;
  } {
    const rawCaseNumberCandidate =
      this.findByEntity(ocr.entities, [
        'caseNumber',
        'case_number',
        '사건번호',
      ]) ??
      this.findByFormField(ocr.formFields, ['사건번호', '사건 번호']) ??
      this.findReceiptCaseNumberByPattern(ocr);
    const rawItemNumberCandidate =
      this.findByEntity(ocr.entities, [
        'itemNumber',
        'item_number',
        '물건번호',
      ]) ??
      this.findByFormField(ocr.formFields, ['물건번호', '물건 번호']) ??
      this.findReceiptItemNumberByPattern(ocr);

    const caseNumberCandidate = this.normalizeReceiptCaseNumberCandidate(
      rawCaseNumberCandidate,
    );
    const itemNumberCandidate = this.normalizeReceiptItemNumberCandidate(
      rawItemNumberCandidate,
    );
    const caseValue = caseNumberCandidate?.value ?? null;
    const itemValue = itemNumberCandidate?.value ?? null;
    const caseMatched = caseValue ? this.isValidReceiptCaseNumber(caseValue) : false;
    const itemMatched = itemValue ? this.isValidReceiptItemNumber(itemValue) : false;

    const caseParsed = this.toReceiptParsedField(
      caseNumberCandidate,
      caseMatched,
      reviewThreshold,
    );
    const itemParsed = this.toReceiptParsedField(
      itemNumberCandidate,
      itemMatched,
      reviewThreshold,
    );

    return {
      parsed: {
        principalName: {
          value: null,
          confidence: null,
          needsReview: true,
        },
        purposeCourtName: {
          value: null,
          confidence: null,
          needsReview: true,
        },
        caseNumber: caseParsed.field,
        itemName: itemParsed.field,
        submissionInstitution: {
          value: null,
          confidence: null,
          needsReview: true,
        },
        agentName: {
          value: null,
          confidence: null,
          needsReview: true,
        },
      },
      lowConfidenceWarning: {
        caseNumber: caseParsed.lowConfidenceWarning,
        itemNumber: itemParsed.lowConfidenceWarning,
      },
    };
  }

  private toReceiptParsedField(
    candidate: ParsedCandidate | null,
    patternMatched: boolean,
    reviewThreshold: number,
  ): { field: ParsedField; lowConfidenceWarning: boolean } {
    const lowConfidenceThreshold = 0.45;

    if (!candidate) {
      return {
        field: {
          value: null,
          confidence: null,
          needsReview: true,
        },
        lowConfidenceWarning: false,
      };
    }

    // 영수증은 pattern 우선: 패턴이 맞으면 통과.
    // 단, confidence가 낮으면(<0.45) low-confidence 경고 플래그를 추가.
    if (patternMatched) {
      if (
        candidate.confidence !== null &&
        candidate.confidence < lowConfidenceThreshold
      ) {
        return {
          field: {
            value: candidate.value,
            confidence: candidate.confidence,
            needsReview: false,
          },
          lowConfidenceWarning: true,
        };
      }

      return {
        field: {
          value: candidate.value,
          confidence: candidate.confidence,
          needsReview: false,
        },
        lowConfidenceWarning: false,
      };
    }

    // 패턴 불일치면 기존 confidence 기준으로 판단
    return {
      field: this.toParsedField(candidate, reviewThreshold),
      lowConfidenceWarning: false,
    };
  }

  private isValidReceiptCaseNumber(value: string): boolean {
    return /^\d{4}\s*타경\s*\d+$/.test(value);
  }

  private isValidReceiptItemNumber(value: string): boolean {
    return /^\d{1,3}$/.test(value);
  }

  private normalizeReceiptCaseNumberCandidate(
    candidate: ParsedCandidate | null,
  ): ParsedCandidate | null {
    const value = this.cleanValue(candidate?.value ?? '');
    if (!value) {
      return null;
    }

    const matched = this.extractCaseNumberFromText(value);
    if (!matched) {
      return candidate;
    }

    return {
      value: matched,
      confidence: candidate?.confidence ?? null,
    };
  }

  private normalizeReceiptItemNumberCandidate(
    candidate: ParsedCandidate | null,
  ): ParsedCandidate | null {
    const value = this.cleanValue(candidate?.value ?? '');
    if (!value) {
      return null;
    }

    const matched = this.extractItemNumberFromText(value);
    if (!matched) {
      return candidate;
    }

    return {
      value: matched,
      confidence: candidate?.confidence ?? null,
    };
  }

  private findReceiptCaseNumberByPattern(
    ocr: OcrDetailedResult,
  ): ParsedCandidate | null {
    for (const text of this.buildReceiptTextCandidates(ocr)) {
      const value = this.extractCaseNumberFromText(text);
      if (value) {
        return { value, confidence: null };
      }
    }

    return null;
  }

  private findReceiptItemNumberByPattern(
    ocr: OcrDetailedResult,
  ): ParsedCandidate | null {
    for (const field of ocr.formFields) {
      const normalizedName = this.normalize(field.name);
      if (
        normalizedName.includes(this.normalize('물건번호')) ||
        normalizedName.includes(this.normalize('물건 번호'))
      ) {
        const value = this.extractItemNumberFromText(field.value);
        if (value) {
          return { value, confidence: field.confidence ?? null };
        }
      }
    }

    for (const text of this.buildReceiptTextCandidates(ocr)) {
      const value = this.extractItemNumberFromText(text);
      if (value) {
        return { value, confidence: null };
      }
    }

    return null;
  }

  private buildReceiptTextCandidates(ocr: OcrDetailedResult): string[] {
    const source = [
      ocr.text,
      ...ocr.lines.map((line) => line.text),
      ...ocr.formFields.flatMap((field) => [
        `${field.name}: ${field.value}`,
        field.value,
      ]),
      ...ocr.entities.map((entity) => entity.mentionText),
    ];

    return source.map((item) => item ?? '').filter((item) => item.trim().length > 0);
  }

  private extractCaseNumberFromText(text: string): string | null {
    const cleaned = text.replace(/\s+/g, '');
    const strict = cleaned.match(/([12]\d{3})타경(\d{3,})/);
    if (strict) {
      return `${strict[1]}타경${strict[2]}`;
    }

    const loose = text
      .replace(/\s+/g, ' ')
      .match(/([12]\d{3})\s*타\s*경\s*(\d{3,})/);
    if (loose) {
      return `${loose[1]}타경${loose[2]}`;
    }

    return null;
  }

  private extractItemNumberFromText(text: string): string | null {
    const withLabel = text.match(/물\s*건\s*번\s*호\s*[:：]?\s*(\d{1,3})/);
    if (withLabel?.[1]) {
      return withLabel[1];
    }

    const justDigits = this.cleanValue(text)?.match(/^(\d{1,3})$/);
    if (justDigits?.[1]) {
      return justDigits[1];
    }

    return null;
  }

  // 위임장 전용 파서: 입찰인 이름 + 사건번호를 추출한다.
  private parsePowerOfAttorneyFields(
    ocr: OcrDetailedResult,
    reviewThreshold: number,
  ): ParsedResult {
    const bidderNameCandidate = this.findByEntity(ocr.entities, [
      'bidderName',
      'bidder_name',
      '입찰인',
    ]);
    const caseNumberCandidate = this.findByEntity(ocr.entities, [
      'caseNumber',
      'case_number',
      '사건번호',
    ]);

    return {
      principalName: this.toParsedField(bidderNameCandidate, reviewThreshold),
      purposeCourtName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      caseNumber: this.toParsedField(caseNumberCandidate, reviewThreshold),
      itemName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      submissionInstitution: {
        value: null,
        confidence: null,
        needsReview: true,
      },
      agentName: {
        value: null,
        confidence: null,
        needsReview: true,
      },
    };
  }

  private async extractSignPdfOcr(file: Express.Multer.File): Promise<OcrDetailedResult> {
    const customProcessorId =
      process.env.GOOGLE_CUSTOM_PROCESSOR_ID ||
      process.env.GCP_CUSTOM_PROCESSOR_ID ||
      '';

    if (customProcessorId) {
      if (file.mimetype === 'application/pdf') {
        return this.ocrEngineService.recognizePdfDetailedWithProcessor(
          file.buffer,
          customProcessorId,
        );
      }
      return this.ocrEngineService.recognizeImageDetailedWithProcessor(
        file.buffer,
        file.mimetype,
        customProcessorId,
      );
    }

    if (file.mimetype === 'application/pdf') {
      return this.ocrEngineService.recognizePdfWithLayoutParserDetailed(file.buffer);
    }

    return this.ocrEngineService.recognizeImageDetailed(file.buffer, file.mimetype);
  }

  private async extractImageOcr(file: Express.Multer.File): Promise<OcrDetailedResult> {
    if (!file.mimetype.startsWith('image/')) {
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
        error: null,
      };
    }

    const customProcessorId =
      process.env.GOOGLE_CUSTOM_PROCESSOR_ID ||
      process.env.GCP_CUSTOM_PROCESSOR_ID ||
      '';

    if (customProcessorId) {
      return this.ocrEngineService.recognizeImageDetailedWithProcessor(
        file.buffer,
        file.mimetype,
        customProcessorId,
      );
    }

    return this.ocrEngineService.recognizeImageDetailed(file.buffer, file.mimetype);
  }

  private async extractReceiptOcr(
    file: Express.Multer.File,
    applyReceiptPreprocess: boolean,
  ): Promise<ReceiptOcrResult> {
    if (!file.mimetype.startsWith('image/')) {
      return {
        result: {
          text: '',
          lines: [],
          formFields: [],
          entities: [],
          error: null,
        },
        preprocessedImageBase64: null,
        preprocessedImageMimeType: null,
        preprocessAngle: null,
        preprocessShear: null,
        preprocessCropApplied: false,
      };
    }

    const formProcessorId =
      process.env.GOOGLE_FORM_PROCESSOR_ID ||
      process.env.GCP_FORM_PROCESSOR_ID ||
      '';

    const preprocessed = applyReceiptPreprocess
      ? await this.preprocessReceiptImage(file.buffer)
      : null;
    const ocrBuffer = preprocessed?.buffer ?? file.buffer;
    const ocrMimeType = preprocessed ? 'image/png' : file.mimetype;
    const runReceiptOcr = async (buffer: Buffer, mimeType: string) => {
      if (formProcessorId) {
        return this.ocrEngineService.recognizeImageDetailedWithProcessor(
          buffer,
          mimeType,
          formProcessorId,
        );
      }
      return this.ocrEngineService.recognizeImageDetailed(buffer, mimeType);
    };

    if (!applyReceiptPreprocess) {
      const originalResult = await runReceiptOcr(file.buffer, file.mimetype);
      return {
        result: originalResult,
        preprocessedImageBase64: null,
        preprocessedImageMimeType: null,
        preprocessAngle: null,
        preprocessShear: null,
        preprocessCropApplied: false,
      };
    }

    const toneTunedFull = await this.toneTuneReceiptImage(ocrBuffer);
    const roiBuffer = await this.extractReceiptTableRoi(ocrBuffer);
    const toneTunedRoi = roiBuffer ? await this.toneTuneReceiptImage(roiBuffer) : null;

    const candidates: Array<{ key: string; buffer: Buffer; mimeType: string }> = [
      { key: 'fullBase', buffer: ocrBuffer, mimeType: ocrMimeType },
      { key: 'fullTone', buffer: toneTunedFull, mimeType: 'image/png' },
    ];
    if (roiBuffer) {
      candidates.push({ key: 'roiBase', buffer: roiBuffer, mimeType: 'image/png' });
    }
    if (toneTunedRoi) {
      candidates.push({ key: 'roiTone', buffer: toneTunedRoi, mimeType: 'image/png' });
    }

    let bestResult: OcrDetailedResult | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const ocrResult = await runReceiptOcr(candidate.buffer, candidate.mimeType);
      const score = this.scoreReceiptCandidate(ocrResult);
      if (score > bestScore) {
        bestScore = score;
        bestResult = ocrResult;
      }
    }

    const result =
      bestResult ??
      (await runReceiptOcr(ocrBuffer, ocrMimeType));

    return {
      result,
      preprocessedImageBase64: preprocessed ? ocrBuffer.toString('base64') : null,
      preprocessedImageMimeType: preprocessed ? ocrMimeType : null,
      preprocessAngle: preprocessed?.angle ?? null,
      preprocessShear: preprocessed?.shear ?? null,
      preprocessCropApplied: preprocessed?.cropApplied ?? false,
    };
  }

  private async toneTuneReceiptImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .grayscale()
      .linear(1.12, -8)
      .normalize()
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  private async extractReceiptTableRoi(buffer: Buffer): Promise<Buffer | null> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return null;
    }

    // 영수증의 사건번호/물건번호 표 영역 중심 crop
    const left = Math.max(0, Math.floor(width * 0.06));
    const top = Math.max(0, Math.floor(height * 0.22));
    const roiWidth = Math.max(120, Math.floor(width * 0.88));
    const roiHeight = Math.max(120, Math.floor(height * 0.44));
    const safeWidth = Math.min(roiWidth, width - left);
    const safeHeight = Math.min(roiHeight, height - top);

    if (safeWidth < 100 || safeHeight < 100) {
      return null;
    }

    return sharp(buffer)
      .extract({
        left,
        top,
        width: safeWidth,
        height: safeHeight,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  private async preprocessReceiptImage(
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; angle: number; shear: number; cropApplied: boolean } | null> {
    try {
      const oriented = await sharp(buffer)
        .rotate()
        .png({ compressionLevel: 9 })
        .toBuffer();

      const cropResult = await this.cropDocumentRegion(oriented);
      const cropped = cropResult.buffer;
      const candidateAngles = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
      let bestBuffer: Buffer | null = null;
      let bestAngle = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const angle of candidateAngles) {
        const processed = await sharp(cropped)
          .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png({ compressionLevel: 9 })
          .toBuffer();

        const score = await this.scoreHorizontalAlignment(processed);
        if (score > bestScore) {
          bestScore = score;
          bestBuffer = processed;
          bestAngle = angle;
        }
      }

      if (!bestBuffer) {
        return null;
      }

      const shearResult = await this.applyPerspectiveLikeShear(bestBuffer);
      const finalBuffer = await sharp(shearResult.buffer)
        .normalize()
        .png({ compressionLevel: 9 })
        .toBuffer();

      return {
        buffer: finalBuffer,
        angle: bestAngle,
        shear: shearResult.shear,
        cropApplied: cropResult.applied,
      };
    } catch (error) {
      console.warn(
        'Receipt preprocessing failed:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private async cropDocumentRegion(
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; applied: boolean }> {
    const gray = sharp(buffer).grayscale();
    const metadata = await gray.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return { buffer, applied: false };
    }

    const raw = await gray.raw().toBuffer();
    const threshold = 244;
    const rowDarkCounts = new Array<number>(height).fill(0);
    const colDarkCounts = new Array<number>(width).fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = raw[y * width + x] ?? 255;
        if (value < threshold) {
          rowDarkCounts[y] += 1;
          colDarkCounts[x] += 1;
        }
      }
    }

    const minRowDark = Math.max(8, Math.floor(width * 0.012));
    const minColDark = Math.max(8, Math.floor(height * 0.012));

    let top = rowDarkCounts.findIndex((count) => count >= minRowDark);
    let bottom = height - 1;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (rowDarkCounts[y] >= minRowDark) {
        bottom = y;
        break;
      }
    }

    let left = colDarkCounts.findIndex((count) => count >= minColDark);
    let right = width - 1;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (colDarkCounts[x] >= minColDark) {
        right = x;
        break;
      }
    }

    if (top < 0 || left < 0 || bottom <= top || right <= left) {
      return { buffer, applied: false };
    }

    const marginX = Math.floor(width * 0.02);
    const marginY = Math.floor(height * 0.02);
    const extractLeft = Math.max(0, left - marginX);
    const extractTop = Math.max(0, top - marginY);
    const extractRight = Math.min(width - 1, right + marginX);
    const extractBottom = Math.min(height - 1, bottom + marginY);

    const extractWidth = extractRight - extractLeft + 1;
    const extractHeight = extractBottom - extractTop + 1;
    if (extractWidth < 100 || extractHeight < 100) {
      return { buffer, applied: false };
    }

    const extracted = await sharp(buffer)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer: extracted, applied: true };
  }

  private async applyPerspectiveLikeShear(
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; shear: number }> {
    const gray = sharp(buffer).grayscale();
    const metadata = await gray.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return { buffer, shear: 0 };
    }

    const raw = await gray.raw().toBuffer();
    const bandHeight = Math.max(8, Math.floor(height * 0.1));
    const topBand = { start: Math.floor(height * 0.15), end: Math.floor(height * 0.15) + bandHeight };
    const bottomBand = {
      start: Math.floor(height * 0.75),
      end: Math.floor(height * 0.75) + bandHeight,
    };

    const topLeft = this.estimateEdgeX(raw, width, height, topBand.start, topBand.end, true);
    const topRight = this.estimateEdgeX(raw, width, height, topBand.start, topBand.end, false);
    const bottomLeft = this.estimateEdgeX(
      raw,
      width,
      height,
      bottomBand.start,
      bottomBand.end,
      true,
    );
    const bottomRight = this.estimateEdgeX(
      raw,
      width,
      height,
      bottomBand.start,
      bottomBand.end,
      false,
    );

    if (
      topLeft === null ||
      topRight === null ||
      bottomLeft === null ||
      bottomRight === null
    ) {
      return { buffer, shear: 0 };
    }

    const leftDrift = bottomLeft - topLeft;
    const rightDrift = bottomRight - topRight;
    const avgDrift = (leftDrift + rightDrift) / 2;
    const shear = this.clamp(-avgDrift / Math.max(height, 1), -0.08, 0.08);

    if (Math.abs(shear) < 0.003) {
      return { buffer, shear: 0 };
    }

    const sheared = await sharp(buffer)
      .affine(
        [
          [1, shear],
          [0, 1],
        ],
        { background: { r: 255, g: 255, b: 255, alpha: 1 } },
      )
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer: sheared, shear };
  }

  private estimateEdgeX(
    raw: Buffer,
    width: number,
    height: number,
    rowStart: number,
    rowEnd: number,
    fromLeft: boolean,
  ): number | null {
    const start = this.clamp(Math.floor(rowStart), 0, Math.max(height - 1, 0));
    const end = this.clamp(Math.floor(rowEnd), 0, Math.max(height - 1, 0));
    if (end <= start) {
      return null;
    }

    const edgeThreshold = 220;
    const samples: number[] = [];
    for (let y = start; y <= end; y += 1) {
      if (fromLeft) {
        for (let x = 0; x < width; x += 1) {
          const value = raw[y * width + x] ?? 255;
          if (value < edgeThreshold) {
            samples.push(x);
            break;
          }
        }
      } else {
        for (let x = width - 1; x >= 0; x -= 1) {
          const value = raw[y * width + x] ?? 255;
          if (value < edgeThreshold) {
            samples.push(x);
            break;
          }
        }
      }
    }

    if (samples.length < 4) {
      return null;
    }

    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? null;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private async scoreHorizontalAlignment(buffer: Buffer): Promise<number> {
    const image = sharp(buffer).grayscale();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return Number.NEGATIVE_INFINITY;
    }

    const raw = await image.raw().toBuffer();
    const rowEnergy: number[] = new Array(height).fill(0);

    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let x = 0; x < width; x += 1) {
        const value = raw[y * width + x] ?? 255;
        // 어두운 픽셀(문자/선)만 강조
        sum += Math.max(0, 180 - value);
      }
      rowEnergy[y] = sum / width;
    }

    const mean = rowEnergy.reduce((acc, v) => acc + v, 0) / height;
    const variance =
      rowEnergy.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / height;
    return variance;
  }

  private scoreReceiptCandidate(result: OcrDetailedResult): number {
    const caseFromEntity = this.findByEntity(result.entities, [
      'caseNumber',
      'case_number',
      '사건번호',
    ]);
    const caseFromForm = this.findByFormField(result.formFields, [
      '사건번호',
      '사건 번호',
    ]);
    const itemFromEntity = this.findByEntity(result.entities, [
      'itemNumber',
      'item_number',
      '물건번호',
    ]);
    const itemFromForm = this.findByFormField(result.formFields, [
      '물건번호',
      '물건 번호',
    ]);

    const caseConfidence = this.bestConfidence(
      caseFromEntity?.confidence,
      caseFromForm?.confidence,
    );
    const itemConfidence = this.bestConfidence(
      itemFromEntity?.confidence,
      itemFromForm?.confidence,
    );
    const avgConfidence = (caseConfidence + itemConfidence) / 2;

    const caseValue =
      caseFromEntity?.value ??
      caseFromForm?.value ??
      this.findReceiptCaseNumberByPattern(result)?.value;
    const itemValue =
      itemFromEntity?.value ??
      itemFromForm?.value ??
      this.findReceiptItemNumberByPattern(result)?.value;

    const caseBonus = caseValue ? 0.2 : 0;
    const itemBonus = itemValue ? 0.15 : 0;
    const textBonus = Math.min((result.text?.length ?? 0) / 12000, 0.05);
    const errorPenalty = result.error ? 0.2 : 0;
    return avgConfidence + caseBonus + itemBonus + textBonus - errorPenalty;
  }

  private bestConfidence(...values: Array<number | null | undefined>): number {
    const list = values.filter((v): v is number => typeof v === 'number');
    if (list.length === 0) {
      return 0;
    }
    return Math.max(...list);
  }

  // 전자본인서명확인서 전용 파서: 전본서 필드만 추출한다.
  private parseSignPdfFields(
    ocr: OcrDetailedResult,
    settings: VerificationSettings,
  ): ParsedResult {
    const reviewThreshold = settings.reviewThreshold;
    console.log('전본서 ocr 값 :', ocr);
    const principalNameCandidate =
      this.findByEntityExactType(ocr.entities, 'principalName') ??
      this.findByLayoutLines(
        ocr.lines,
        [
          ...settings.fields.principalName.formFieldLabels,
          settings.fields.principalName.textFallbackLabel,
        ],
        'principalName',
      ) ??
      this.findByEntity(ocr.entities, settings.fields.principalName.entityKeywords) ??
      this.findByFormField(ocr.formFields, settings.fields.principalName.formFieldLabels) ??
      this.findByTextFallback(ocr.text, settings.fields.principalName.textFallbackLabel);

    const purposeTextCandidate =
      this.findByEntityExactType(ocr.entities, 'purposeText') ??
      this.findPurposeTextCandidate(ocr);
    const purposeCourtNameCandidate = this.extractPurposeCourtNameCandidate(
      purposeTextCandidate,
    );
    const caseNumberCandidate = this.extractPurposeCaseNumberCandidate(
      purposeTextCandidate,
    );
    const itemNameCandidate = this.extractPurposeItemNameCandidate(
      purposeTextCandidate,
    );

    const submissionInstitutionCandidate =
      this.findByEntityExactType(ocr.entities, 'submissionInstitution') ??
      this.findByLayoutLines(
        ocr.lines,
        [
          ...settings.fields.submissionInstitution.formFieldLabels,
          settings.fields.submissionInstitution.textFallbackLabel,
        ],
        'submissionInstitution',
      ) ??
      this.findByEntity(
        ocr.entities,
        settings.fields.submissionInstitution.entityKeywords,
      ) ??
      this.findByFormField(
        ocr.formFields,
        settings.fields.submissionInstitution.formFieldLabels,
      ) ??
      this.findByTextFallback(
        ocr.text,
        settings.fields.submissionInstitution.textFallbackLabel,
      );

    const agentNameCandidate =
      this.findByEntityExactType(ocr.entities, 'agentName') ??
      this.findByLayoutLines(
        ocr.lines,
        [
          ...settings.fields.agentName.formFieldLabels,
          settings.fields.agentName.textFallbackLabel,
        ],
        'agentName',
      ) ??
      this.findByEntity(
        ocr.entities,
        settings.fields.agentName.entityKeywords,
      ) ??
      this.findByFormField(
        ocr.formFields,
        settings.fields.agentName.formFieldLabels,
      ) ??
      this.findByTextFallback(
        ocr.text,
        settings.fields.agentName.textFallbackLabel,
      );

 

    return {
      principalName: this.toParsedField(principalNameCandidate, reviewThreshold),
      purposeCourtName: this.toParsedField(
        purposeCourtNameCandidate,
        reviewThreshold,
      ),
      caseNumber: this.toParsedField(
        this.normalizeReceiptCaseNumberCandidate(caseNumberCandidate),
        reviewThreshold,
      ),
      itemName: this.toParsedField(itemNameCandidate, reviewThreshold),
      submissionInstitution: this.toParsedField(
        submissionInstitutionCandidate,
        reviewThreshold,
      ),
      agentName: this.toParsedField(agentNameCandidate, reviewThreshold),
    };
  }

  private findPurposeTextCandidate(ocr: OcrDetailedResult): ParsedCandidate | null {
    return (
      this.findByFormField(ocr.formFields, ['용도', '사용용도', '목적']) ??
      this.findByEntity(ocr.entities, ['purpose', 'usage', '용도']) ??
      this.findByTextFallback(ocr.text, '용도')
    );
  }

  private extractPurposeCourtNameCandidate(
    purposeTextCandidate: ParsedCandidate | null,
  ): ParsedCandidate | null {
    const parsed = this.parsePurposeTextParts(purposeTextCandidate?.value ?? null);
    if (!parsed.courtName || !purposeTextCandidate) {
      return null;
    }
    return {
      value: parsed.courtName,
      confidence: purposeTextCandidate.confidence,
    };
  }

  private extractPurposeCaseNumberCandidate(
    purposeTextCandidate: ParsedCandidate | null,
  ): ParsedCandidate | null {
    const parsed = this.parsePurposeTextParts(purposeTextCandidate?.value ?? null);
    if (!parsed.caseNumber || !purposeTextCandidate) {
      return null;
    }
    return {
      value: parsed.caseNumber,
      confidence: purposeTextCandidate.confidence,
    };
  }

  private extractPurposeItemNameCandidate(
    purposeTextCandidate: ParsedCandidate | null,
  ): ParsedCandidate | null {
    const parsed = this.parsePurposeTextParts(purposeTextCandidate?.value ?? null);
    if (!parsed.itemName || !purposeTextCandidate) {
      return null;
    }
    return {
      value: parsed.itemName,
      confidence: purposeTextCandidate.confidence,
    };
  }

  private parsePurposeTextParts(rawPurposeText: string | null): {
    courtName: string | null;
    caseNumber: string | null;
    itemName: string | null;
  } {
    const core = this.extractPurposeCoreText(rawPurposeText);
    if (!core) {
      return {
        courtName: null,
        caseNumber: null,
        itemName: null,
      };
    }

    const caseNumber = this.extractCaseNumberFromText(core);
    const itemName =
      core.match(/\[\s*(\d{1,3})\s*\]/)?.[1] ??
      core.match(/물건\s*번?\s*호\s*[:：]?\s*(\d{1,3})/)?.[1] ??
      null;

    let courtSource = core;
    courtSource = courtSource
      .replace(/([12]\d)\s*(\d)\s*타\s*경\s*\d{3,}/g, ' ')
      .replace(/([12]\d{3})\s*타\s*경\s*\d{3,}/g, ' ')
      .replace(/\[\s*\d{1,3}\s*\]/g, ' ')
      .replace(/물건\s*번?\s*호\s*[:：]?\s*\d{1,3}/g, ' ')
      .replace(/대리입찰|입찰|외의\s*용도|용도/g, ' ')
      .replace(/[,:]/g, ' ');
    courtSource = this.cleanValue(courtSource) ?? '';

    const courtNameRaw =
      courtSource.match(
        /([가-힣\s]*?(?:고등법원|지방법원|법원)(?:\s*(?:[가-힣]+\s*지원|본원))?)/,
      )?.[1] ?? '';
    const courtName = this.normalizeCourtName(courtNameRaw);

    return {
      courtName,
      caseNumber,
      itemName,
    };
  }

  private normalizeCourtName(rawValue: string): string | null {
    const cleaned = this.cleanValue(rawValue);
    if (!cleaned) {
      return null;
    }

    // OCR에서 "청 주 지방법원"처럼 자음/음절이 띄어질 때, 법원명 접두부는 붙여서 정규화
    const mergedPrefix = cleaned.replace(
      /((?:[가-힣]\s+){1,8})(지방법원|고등법원|법원)/,
      (_match, spacedPrefix: string, courtToken: string) =>
        `${spacedPrefix.replace(/\s+/g, '')}${courtToken}`,
    );

    return this.cleanValue(mergedPrefix);
  }

  private extractPurposeCoreText(rawPurposeText: string | null): string | null {
    const text = this.cleanValue(rawPurposeText ?? '');
    if (!text) {
      return null;
    }

    const paren = text.match(/\(([^)]+)\)/);
    const core = this.cleanValue(paren?.[1] ?? text) ?? text;

    return this.cleanValue(
      core
        .replace(/^[☐☑□■\s]+/, '')
        .replace(/^외의\s*용도\s*[:：]?/, '')
        .replace(/^용도\s*[:：]?/, ''),
    );
  }

  private logReceiptConfidenceDebug(ocr: OcrDetailedResult, parsed: ParsedResult) {
    const formFields = ocr.formFields.map((field) => ({
      name: field.name,
      value: field.value,
      confidence: field.confidence,
    }));
    const entities = ocr.entities.map((entity) => ({
      type: entity.type,
      mentionText: entity.mentionText,
      confidence: entity.confidence,
    }));

    const caseFromFormField = this.findByFormField(ocr.formFields, ['사건번호', '사건 번호']);
    const itemFromFormField = this.findByFormField(ocr.formFields, ['물건번호', '물건 번호']);
    const caseFromEntity = this.findByEntity(ocr.entities, ['caseNumber', 'case_number', '사건번호']);
    const itemFromEntity = this.findByEntity(ocr.entities, ['itemNumber', 'item_number', '물건번호']);

    console.log('[Receipt confidence debug]', {
      source: 'Document AI processDocument response',
      selectedForParsed: {
        caseNumber: {
          value: parsed.caseNumber.value,
          confidence: parsed.caseNumber.confidence,
          needsReview: parsed.caseNumber.needsReview,
        },
        itemNumber: {
          value: parsed.itemName.value,
          confidence: parsed.itemName.confidence,
          needsReview: parsed.itemName.needsReview,
        },
      },
      candidates: {
        caseNumber: {
          fromFormField: caseFromFormField,
          fromEntity: caseFromEntity,
        },
        itemNumber: {
          fromFormField: itemFromFormField,
          fromEntity: itemFromEntity,
        },
      },
      formFields,
      entities,
    });
  }

  private findByFormField(
    fields: OcrFormField[],
    labels: string[],
  ): { value: string; confidence: number | null } | null {
    for (const field of fields) {
      const name = this.normalize(field.name);
      const matched = labels.some((label) => name.includes(this.normalize(label)));
      if (!matched) {
        continue;
      }

      const value = this.cleanValue(field.value);
      if (value) {
        return {
          value,
          confidence: field.confidence ?? null,
        };
      }
    }

    return null;
  }

  private findByEntity(
    entities: OcrEntity[],
    types: string[],
  ): { value: string; confidence: number | null } | null {
    for (const entity of entities) {
      const type = this.normalize(entity.type);
      const matched = types.some((keyword) => type.includes(this.normalize(keyword)));
      if (!matched) {
        continue;
      }

      const value = this.cleanValue(entity.mentionText);
      if (value) {
        return {
          value,
          confidence: entity.confidence ?? null,
        };
      }
    }

    return null;
  }

  private findByEntityExactType(
    entities: OcrEntity[],
    typeName: string,
  ): { value: string; confidence: number | null } | null {
    const target = this.normalize(typeName);
    for (const entity of entities) {
      if (this.normalize(entity.type) !== target) {
        continue;
      }
      const value = this.cleanValue(entity.mentionText);
      if (!value) {
        continue;
      }
      return {
        value,
        confidence: entity.confidence ?? null,
      };
    }
    return null;
  }

  private findByLayoutLines(
    lines: OcrLine[],
    labels: string[],
    fieldKey: ParsedFieldKey,
  ): { value: string; confidence: number | null } | null {
    if (lines.length === 0 || labels.length === 0) {
      return null;
    }

    const uniqueLabels = Array.from(
      new Set(labels.map((label) => this.cleanValue(label)).filter(Boolean)),
    ) as string[];

    const orderedLines = [...lines].sort((a, b) =>
      a.top === b.top ? a.left - b.left : a.top - b.top,
    );
    const normalizedCoords = this.isNormalizedCoordinates(orderedLines);

    let bestValue: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const label of uniqueLabels) {
      const normalizedLabel = this.normalize(label);
      if (!normalizedLabel) {
        continue;
      }

      const exactLabelLines = orderedLines.filter(
        (line) => this.normalize(line.text) === normalizedLabel,
      );
      const fallbackLabelLines = orderedLines.filter((line) =>
        this.normalize(line.text).includes(normalizedLabel),
      );
      const labelLines = exactLabelLines.length > 0 ? exactLabelLines : fallbackLabelLines;

      for (const labelLine of labelLines) {
        const normalizedLine = this.normalize(labelLine.text);
        if (!normalizedLine.includes(normalizedLabel)) {
          continue;
        }

        const inline = this.extractInlineValueFromLabelLine(labelLine.text, label);
        const inlineProcessed = this.postProcessLayoutValue(fieldKey, inline);
        if (inlineProcessed) {
          return { value: inlineProcessed, confidence: null };
        }

        const right = this.findNearestRightLine(
          orderedLines,
          labelLine,
          normalizedCoords,
        );
        const rightProcessed = this.postProcessLayoutValue(fieldKey, right?.text ?? null);
        if (rightProcessed && (right?.score ?? Number.POSITIVE_INFINITY) < bestScore) {
          bestValue = rightProcessed;
          bestScore = right!.score;
        }

        const below = this.findNearestBelowLine(
          orderedLines,
          labelLine,
          normalizedCoords,
        );
        const belowProcessed = this.postProcessLayoutValue(fieldKey, below?.text ?? null);
        if (belowProcessed && (below?.score ?? Number.POSITIVE_INFINITY) < bestScore) {
          bestValue = belowProcessed;
          bestScore = below!.score;
        }
      }
    }

    return bestValue ? { value: bestValue, confidence: null } : null;
  }

  private extractInlineValueFromLabelLine(lineText: string, label: string): string | null {
    const cleanedLine = this.cleanValue(lineText);
    if (!cleanedLine) {
      return null;
    }

    const index = cleanedLine.indexOf(label);
    if (index < 0) {
      return null;
    }

    const remainder = cleanedLine
      .slice(index + label.length)
      .replace(/^[:：\-\s]+/, '');
    return this.cleanValue(remainder);
  }

  private findNearestRightLine(
    lines: OcrLine[],
    labelLine: OcrLine,
    normalizedCoords: boolean,
  ): { text: string; score: number } | null {
    const verticalTolerance = normalizedCoords
      ? Math.max(0.03, labelLine.height * 2)
      : Math.max(20, labelLine.height * 2);
    const maxHorizontalGap = normalizedCoords ? 0.8 : 800;
    const candidates = lines
      .filter((line) => line !== labelLine)
      .map((line) => ({
        line,
        horizontalGap: line.left - labelLine.right,
        verticalGap: Math.abs(line.centerY - labelLine.centerY),
      }))
      .filter(
        (item) =>
          item.horizontalGap >= (normalizedCoords ? -0.02 : -6) &&
          item.horizontalGap <= maxHorizontalGap &&
          item.verticalGap <= verticalTolerance,
      )
      .filter((item) => !this.isNoiseOrLabelLine(item.line.text))
      .map((item) => ({
        text: item.line.text,
        score: item.verticalGap * 4 + Math.max(0, item.horizontalGap),
      }))
      .sort((a, b) => a.score - b.score);

    return candidates[0] ?? null;
  }

  private findNearestBelowLine(
    lines: OcrLine[],
    labelLine: OcrLine,
    normalizedCoords: boolean,
  ): { text: string; score: number } | null {
    const labelCenterX = (labelLine.left + labelLine.right) / 2;
    const maxVerticalGap = normalizedCoords ? 0.2 : 80;
    const maxCenterGap = normalizedCoords ? 0.35 : 100;
    const candidates = lines
      .filter((line) => line !== labelLine)
      .map((line) => ({
        line,
        verticalGap: line.top - labelLine.bottom,
        overlapX: this.getHorizontalOverlap(labelLine, line),
        centerGap: Math.abs((line.left + line.right) / 2 - labelCenterX),
      }))
      .filter(
        (item) =>
          item.verticalGap >= (normalizedCoords ? -0.01 : -2) &&
          item.verticalGap <= maxVerticalGap,
      )
      .filter((item) => item.overlapX >= 0 || item.centerGap <= maxCenterGap)
      .filter((item) => !this.isNoiseOrLabelLine(item.line.text))
      .map((item) => ({
        text: item.line.text,
        score: item.verticalGap * 4 + item.centerGap,
      }))
      .sort((a, b) => a.score - b.score);

    return candidates[0] ?? null;
  }

  private getHorizontalOverlap(a: OcrLine, b: OcrLine): number {
    return Math.min(a.right, b.right) - Math.max(a.left, b.left);
  }

  private postProcessLayoutValue(
    fieldKey: ParsedFieldKey,
    rawValue: string | null,
  ): string | null {
    const cleaned = this.cleanValue(rawValue ?? '');
    if (!cleaned) {
      return null;
    }

    if (fieldKey === 'principalName') {
      const onlyKoreanTail = cleaned.match(
        /(?:[가-힣]{1,2}\s*[가-힣]{1,4}|[가-힣]{2,5})$/,
      );
      if (onlyKoreanTail) {
        const candidate = this.cleanValue(onlyKoreanTail[0]);
        if (this.isLikelyPersonName(candidate)) {
          return candidate;
        }
      }
      return null;
    }

    if (fieldKey === 'purposeCourtName') {
      const hasCourtHint = /(법원|지원|지방법원|고등법원|법원명)/.test(cleaned);
      return hasCourtHint ? this.cleanValue(cleaned) : null;
    }

    if (fieldKey === 'caseNumber') {
      return this.extractCaseNumberFromText(cleaned);
    }

    if (fieldKey === 'itemName') {
      const withoutCheckbox = cleaned.replace(/^[☐☑□■\s]+/, '');
      const paren = withoutCheckbox.match(/\(([^)]+)\)/);
      if (paren?.[1]) {
        return this.cleanValue(paren[1]);
      }
      const hasItemHint = /(물건명|물건번호|물건 번호|호실|호|동|아파트|오피스텔|토지)/.test(
        withoutCheckbox,
      );
      return hasItemHint ? this.cleanValue(withoutCheckbox) : null;
    }

    if (fieldKey === 'submissionInstitution') {
      const hasInstitutionHint = /(법원|기관|청|은행|학교|센터|공사|공단|세무서|경찰서)/.test(cleaned);
      return hasInstitutionHint ? cleaned : null;
    }

    if (fieldKey === 'agentName') {
      if (/\(|\)|제출하는경우만작성|다른사람에게위임하여/.test(cleaned)) {
        return null;
      }
      const normalized = cleaned.replace(/\s+/g, '');
      const name = normalized.match(/^[가-힣]{2,5}$/);
      return name ? cleaned : null;
    }

    return cleaned;
  }

  private isNoiseOrLabelLine(text: string): boolean {
    const cleaned = this.cleanValue(text) ?? '';
    if (!cleaned) {
      return true;
    }

    const normalized = this.normalize(cleaned);
    if (!normalized) {
      return true;
    }

    if (/^https?:\/\//i.test(cleaned)) {
      return true;
    }

    if (/^\d+\/\d+$/.test(cleaned)) {
      return true;
    }

    const blockedPatterns = [
      '유의사항',
      '발급확인간이증명서',
      '전자본인서명확인서발급증',
      '전자본인서명확인서제출기관',
      '위임받은사람',
      '발급번호',
      '발급일시',
      '제출하는경우만작성',
      '다른사람에게위임하여',
    ];
    return blockedPatterns.some((pattern) =>
      normalized.includes(this.normalize(pattern)),
    );
  }

  private isNormalizedCoordinates(lines: OcrLine[]): boolean {
    if (lines.length === 0) {
      return false;
    }
    const maxCoord = Math.max(
      ...lines.flatMap((line) => [line.left, line.top, line.right, line.bottom]),
    );
    return maxCoord <= 2;
  }

  private isLikelyPersonName(value: string | null): boolean {
    const cleaned = this.cleanValue(value ?? '');
    if (!cleaned) {
      return false;
    }

    const normalized = cleaned.replace(/\s+/g, '');
    if (!/^[가-힣]{2,5}$/.test(normalized)) {
      return false;
    }

    const blockedWords = new Set([
      '성명',
      '용도',
      '제출기관',
      '위임받은사람',
      '유의사항',
      '발급번호',
      '발급일시',
      '대리입찰',
    ]);

    return !blockedWords.has(normalized);
  }

  private findByTextFallback(
    text: string,
    label: string,
  ): { value: string; confidence: number | null } | null {
    if (!text) {
      return null;
    }

    const lines = text
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const normalizedLabel = this.normalize(label);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const normalizedLine = this.normalize(line);
      if (!normalizedLine.includes(normalizedLabel)) {
        continue;
      }

      const inline = this.cleanValue(
        line
          .replace(label, '')
          .replace(/^[:：\-\s]+/, ''),
      );
      if (inline) {
        return { value: inline, confidence: null };
      }

      const next = this.cleanValue(lines[i + 1] ?? '');
      if (next) {
        return { value: next, confidence: null };
      }
    }

    return null;
  }

  private toParsedField(
    candidate: { value: string; confidence: number | null } | null,
    reviewThreshold: number,
  ): ParsedField {
    if (!candidate) {
      return {
        value: null,
        confidence: null,
        needsReview: true,
      };
    }

    if (candidate.confidence === null) {
      return {
        value: candidate.value,
        confidence: null,
        needsReview: true,
      };
    }

    return {
      value: candidate.value,
      confidence: candidate.confidence,
      needsReview: candidate.confidence < reviewThreshold,
    };
  }

  private normalize(value: string): string {
    return (value ?? '').replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
  }

  private cleanValue(value: string): string | null {
    const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  private toMetadata(file: Express.Multer.File): UploadedFileMetadata {
    return {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}
