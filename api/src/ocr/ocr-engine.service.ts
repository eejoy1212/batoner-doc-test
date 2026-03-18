import { Injectable, Logger } from '@nestjs/common';
import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai';

export type OcrLine = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerY: number;
};

export type OcrDetailedResult = {
  text: string;
  lines: OcrLine[];
  formFields: OcrFormField[];
  entities: OcrEntity[];
};

export type OcrFormField = {
  name: string;
  value: string;
  confidence: number | null;
};

export type OcrEntity = {
  type: string;
  mentionText: string;
  confidence: number | null;
};

@Injectable()
export class OcrEngineService {
  private readonly logger = new Logger(OcrEngineService.name);
  private readonly client: DocumentProcessorServiceClient;

  constructor() {
    const location = process.env.GCP_LOCATION || 'us';
    this.client = new DocumentProcessorServiceClient({
      apiEndpoint: `${location}-documentai.googleapis.com`,
    });
  }

  // OCR 엔진을 교체하기 쉽도록 서비스로 분리
  async recognizeImage(
    buffer: Buffer,
    mimeType = 'image/png',
  ): Promise<string> {
    const result = await this.recognizeImageDetailed(buffer, mimeType);
    return result.text;
  }

  async recognizeImageDetailed(
    buffer: Buffer,
    mimeType = 'image/png',
  ): Promise<OcrDetailedResult> {
    try {
      return await this.processWithDocumentAi(buffer, mimeType);
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'details' in error
          ? String((error as { details?: unknown }).details ?? '')
          : '';
      this.logger.warn(
        'Document AI OCR failed: ' +
          (error instanceof Error ? error.message : String(error)) +
          (details ? ` | details: ${details}` : ''),
      );
      return { text: '', lines: [], formFields: [], entities: [] };
    }
  }

  private async processWithDocumentAi(
    buffer: Buffer,
    mimeType: string,
  ): Promise<OcrDetailedResult> {
    const processorName = this.getProcessorName();
    const request: protos.google.cloud.documentai.v1.IProcessRequest = {
      name: processorName,
      rawDocument: {
        // gRPC bytes field는 Buffer(원본 바이트) 전달이 가장 안전함
        content: buffer,
        mimeType,
      },
    };

    const [result] = await this.client.processDocument(request);
    const document = result.document;
    if (!document) {
      return { text: '', lines: [], formFields: [], entities: [] };
    }

    const fullText = document.text ?? '';
    const lines = this.extractLinesFromDocument(document, fullText);
    const formFields = this.extractFormFieldsFromDocument(document, fullText);
    const entities = this.extractEntitiesFromDocument(document);

    return {
      text: fullText.trim(),
      lines,
      formFields,
      entities,
    };
  }

  private getProcessorName(): string {
    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
    const location = process.env.GCP_LOCATION || process.env.GOOGLE_LOCATION || 'us';
    const processorId = process.env.GCP_PROCESSOR_ID || process.env.GOOGLE_PROCESSOR_ID;

    if (!projectId || !processorId) {
      throw new Error(
        'Missing GCP env vars. Set GCP_PROJECT_ID/GOOGLE_PROJECT_ID, GCP_LOCATION/GOOGLE_LOCATION, GCP_PROCESSOR_ID/GOOGLE_PROCESSOR_ID.',
      );
    }

    return `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  private extractLinesFromDocument(
    document: protos.google.cloud.documentai.v1.IDocument,
    fullText: string,
  ): OcrLine[] {
    const pages = document.pages ?? [];
    const lines: OcrLine[] = [];

    for (const page of pages) {
      const pageWidth = Number(page.dimension?.width ?? 0);
      const pageHeight = Number(page.dimension?.height ?? 0);
      const pageLines = page.lines ?? [];

      for (const line of pageLines) {
        const text = this.getTextByTextAnchor(fullText, line.layout?.textAnchor)
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) {
          continue;
        }

        const box = this.getPixelBox(
          line.layout?.boundingPoly,
          pageWidth,
          pageHeight,
        );
        if (!box) {
          continue;
        }

        lines.push({
          text,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          right: box.right,
          bottom: box.bottom,
          centerY: (box.top + box.bottom) / 2,
        });
      }
    }

    return lines.sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));
  }

  private extractFormFieldsFromDocument(
    document: protos.google.cloud.documentai.v1.IDocument,
    fullText: string,
  ): OcrFormField[] {
    const pages = document.pages ?? [];
    const fields: OcrFormField[] = [];

    for (const page of pages) {
      const formFields = page.formFields ?? [];
      for (const formField of formFields) {
        const name = this.getTextByLayout(fullText, formField.fieldName).replace(/\s+/g, ' ').trim();
        const value = this.getTextByLayout(fullText, formField.fieldValue).replace(/\s+/g, ' ').trim();
        if (!name && !value) {
          continue;
        }
        const rawConfidence = Number(
          formField.fieldValue?.confidence ?? formField.fieldName?.confidence ?? NaN,
        );
        fields.push({
          name,
          value,
          confidence: Number.isFinite(rawConfidence) ? rawConfidence : null,
        });
      }
    }

    return fields;
  }

  private extractEntitiesFromDocument(
    document: protos.google.cloud.documentai.v1.IDocument,
  ): OcrEntity[] {
    return (document.entities ?? [])
      .map((entity) => ({
        type: entity.type ?? '',
        mentionText: (entity.mentionText ?? '').replace(/\s+/g, ' ').trim(),
        confidence: Number.isFinite(Number(entity.confidence))
          ? Number(entity.confidence)
          : null,
      }))
      .filter((entity) => entity.type.length > 0 || entity.mentionText.length > 0);
  }

  private getTextByLayout(
    fullText: string,
    layout?:
      | protos.google.cloud.documentai.v1.Document.Page.ILayout
      | null,
  ): string {
    return this.getTextByTextAnchor(fullText, layout?.textAnchor);
  }

  private getTextByTextAnchor(
    fullText: string,
    textAnchor?: protos.google.cloud.documentai.v1.Document.ITextAnchor | null,
  ): string {
    const segments = textAnchor?.textSegments ?? [];
    if (!segments.length) {
      return '';
    }

    return segments
      .map((segment) => {
        const start = Number(segment.startIndex ?? 0);
        const end = Number(segment.endIndex ?? 0);
        return fullText.slice(start, end);
      })
      .join('');
  }

  private getPixelBox(
    poly:
      | protos.google.cloud.documentai.v1.Document.Page.ILayout['boundingPoly']
      | null
      | undefined,
    pageWidth: number,
    pageHeight: number,
  ): { left: number; top: number; width: number; height: number; right: number; bottom: number } | null {
    const normalized = poly?.normalizedVertices ?? [];
    if (normalized.length > 0 && pageWidth > 0 && pageHeight > 0) {
      const xs = normalized.map((v) => (v.x ?? 0) * pageWidth);
      const ys = normalized.map((v) => (v.y ?? 0) * pageHeight);
      return this.toBox(xs, ys);
    }

    const vertices = poly?.vertices ?? [];
    if (vertices.length > 0) {
      const xs = vertices.map((v) => Number(v.x ?? 0));
      const ys = vertices.map((v) => Number(v.y ?? 0));
      return this.toBox(xs, ys);
    }

    return null;
  }

  private toBox(xs: number[], ys: number[]) {
    if (!xs.length || !ys.length) {
      return null;
    }

    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      right,
      bottom,
    };
  }
}
