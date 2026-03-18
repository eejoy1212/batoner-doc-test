import { Injectable } from '@nestjs/common';
import {
  OcrDetailedResult,
  OcrEngineService,
  OcrEntity,
  OcrFormField,
} from '../ocr/ocr-engine.service';
import {
  ParsedField,
  ParsedResult,
  UploadedFileMetadata,
} from '../types/verification.types';

@Injectable()
export class VerificationService {
  constructor(private readonly ocrEngineService: OcrEngineService) {}

  async processUpload(signPdf: Express.Multer.File) {
    const ocr = await this.extractSignPdfOcr(signPdf);
    const parsed = this.parseTargetFields(ocr);

    return {
      success: true,
      files: {
        signPdf: this.toMetadata(signPdf),
      },
      ocr: {
        signPdfText: ocr.text,
        signPdfFormFields: ocr.formFields,
        signPdfEntities: ocr.entities,
      },
      parsed,
    };
  }

  private async extractSignPdfOcr(file: Express.Multer.File): Promise<OcrDetailedResult> {
    if (file.mimetype !== 'application/pdf') {
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
      };
    }

    return this.ocrEngineService.recognizeImageDetailed(file.buffer, 'application/pdf');
  }

  private parseTargetFields(ocr: OcrDetailedResult): ParsedResult {
    const reviewThreshold = Number(process.env.OCR_REVIEW_THRESHOLD ?? 0.9);

    const memberNameCandidate =
      this.findByEntity(ocr.entities, ['name', '성명', 'person']) ??
      this.findByFormField(ocr.formFields, ['성명']) ??
      this.findByTextFallback(ocr.text, '성명');

    const usageCandidate =
      this.findByEntity(ocr.entities, ['usage', '용도', 'purpose']) ??
      this.findByFormField(ocr.formFields, ['용도']) ??
      this.findByTextFallback(ocr.text, '용도');

    const submitInstitutionCandidate =
      this.findByEntity(ocr.entities, ['institution', '제출기관', 'organization']) ??
      this.findByFormField(ocr.formFields, ['전자본인서명확인서 제출기관', '제출기관']) ??
      this.findByTextFallback(ocr.text, '제출기관');

    const delegatedPersonCandidate =
      this.findByEntity(ocr.entities, ['batoner', '위임받은사람', '수임인', '대리인', 'agent']) ??
      this.findByFormField(ocr.formFields, ['위임받은 사람', '위임받은사람']) ??
      this.findByTextFallback(ocr.text, '위임받은 사람');

    return {
      memberName: this.toParsedField(memberNameCandidate, reviewThreshold),
      usage: this.toParsedField(usageCandidate, reviewThreshold),
      submitInstitution: this.toParsedField(submitInstitutionCandidate, reviewThreshold),
      delegatedPerson: this.toParsedField(delegatedPersonCandidate, reviewThreshold),
    };
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
