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
  error: string | null;
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
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
};

@Injectable()
export class OcrEngineService {
  private readonly logger = new Logger(OcrEngineService.name);
  private readonly client: DocumentProcessorServiceClient;
  private readonly retryAttempts = Math.max(
    1,
    Number(process.env.OCR_RETRY_ATTEMPTS ?? 2),
  );

  constructor() {
    const location =
      process.env.GCP_LOCATION || process.env.GOOGLE_LOCATION || 'us';
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
      return await this.processWithRetry(
        () =>
          this.processWithDocumentAi(buffer, mimeType, {
            useLayoutParser: false,
          }),
        'Document AI OCR',
      );
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
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
        error:
          (error instanceof Error ? error.message : String(error)) ||
          'Document AI OCR failed',
      };
    }
  }

  async recognizePdfWithLayoutParserDetailed(
    buffer: Buffer,
  ): Promise<OcrDetailedResult> {
    try {
      return await this.processWithRetry(
        () =>
          this.processWithDocumentAi(buffer, 'application/pdf', {
            useLayoutParser: true,
          }),
        'Document AI Layout Parser',
      );
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'details' in error
          ? String((error as { details?: unknown }).details ?? '')
          : '';
      this.logger.warn(
        'Document AI Layout Parser failed: ' +
          (error instanceof Error ? error.message : String(error)) +
          (details ? ` | details: ${details}` : ''),
      );
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
        error:
          (error instanceof Error ? error.message : String(error)) ||
          'Document AI Layout Parser failed',
      };
    }
  }

  async recognizePdfDetailedWithProcessor(
    buffer: Buffer,
    processorId: string,
  ): Promise<OcrDetailedResult> {
    try {
      return await this.processWithRetry(
        () =>
          this.processWithDocumentAi(buffer, 'application/pdf', {
            useLayoutParser: false,
            processorId,
          }),
        'Document AI Form Processor',
      );
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'details' in error
          ? String((error as { details?: unknown }).details ?? '')
          : '';
      this.logger.warn(
        'Document AI Form Processor failed: ' +
          (error instanceof Error ? error.message : String(error)) +
          (details ? ` | details: ${details}` : ''),
      );
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
        error:
          (error instanceof Error ? error.message : String(error)) ||
          'Document AI Form Processor failed',
      };
    }
  }

  async recognizeImageDetailedWithProcessor(
    buffer: Buffer,
    mimeType: string,
    processorId: string,
  ): Promise<OcrDetailedResult> {
    try {
      return await this.processWithRetry(
        () =>
          this.processWithDocumentAi(buffer, mimeType, {
            useLayoutParser: false,
            processorId,
          }),
        'Document AI Custom Processor',
      );
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'details' in error
          ? String((error as { details?: unknown }).details ?? '')
          : '';
      this.logger.warn(
        'Document AI Custom Processor failed: ' +
          (error instanceof Error ? error.message : String(error)) +
          (details ? ` | details: ${details}` : ''),
      );
      return {
        text: '',
        lines: [],
        formFields: [],
        entities: [],
        error:
          (error instanceof Error ? error.message : String(error)) ||
          'Document AI Custom Processor failed',
      };
    }
  }

  private async processWithDocumentAi(
    buffer: Buffer,
    mimeType: string,
    options: {
      useLayoutParser: boolean;
      processorId?: string;
    },
  ): Promise<OcrDetailedResult> {
    const processorName = this.getProcessorName(
      options.useLayoutParser,
      options.processorId,
    );
    const request: protos.google.cloud.documentai.v1.IProcessRequest = {
      name: processorName,
      rawDocument: {
        // gRPC bytes field는 Buffer(원본 바이트) 전달이 가장 안전함
        content: buffer,
        mimeType,
      },
      processOptions: options.useLayoutParser
        ? {
            layoutConfig: {
              returnBoundingBoxes: true,
            },
          }
        : undefined,
    };

    const [result] = await this.client.processDocument(request);
    const document = result.document;
    this.logRawDocumentAiResult(processorName, document);
    if (!document) {
      return { text: '', lines: [], formFields: [], entities: [], error: null };
    }

    const fullText = document.text ?? '';
    const extractedText = this.extractTextFromDocument(document, fullText);
    const lines = this.extractLinesFromDocument(document, fullText);
    const formFields = this.extractFormFieldsFromDocument(document, fullText);
    const entities = this.extractEntitiesFromDocument(document);

    return {
      text: extractedText,
      lines,
      formFields,
      entities,
      error: null,
    };
  }

  private async processWithRetry<T>(
    task: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt >= this.retryAttempts) {
          break;
        }

        const waitMs = attempt * 700;
        this.logger.warn(
          `${context} attempt ${attempt} failed; retrying in ${waitMs}ms`,
        );
        await this.sleep(waitMs);
      }
    }

    throw lastError;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getProcessorName(
    useLayoutParser: boolean,
    explicitProcessorId?: string,
  ): string {
    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
    const location = process.env.GCP_LOCATION || process.env.GOOGLE_LOCATION || 'us';
    const layoutParserProcessorId =
      process.env.GCP_LAYOUT_PARSER_PROCESSOR_ID ||
      process.env.GOOGLE_LAYOUT_PARSER_PROCESSOR_ID;
    const defaultProcessorId =
      process.env.GCP_PROCESSOR_ID || process.env.GOOGLE_PROCESSOR_ID;
    const processorId =
      explicitProcessorId ||
      (useLayoutParser
        ? layoutParserProcessorId || defaultProcessorId
        : defaultProcessorId || layoutParserProcessorId);

    if (!projectId || !processorId) {
      throw new Error(
        'Missing GCP env vars. Set GCP_PROJECT_ID/GOOGLE_PROJECT_ID, GCP_LOCATION/GOOGLE_LOCATION, and processor id (GCP_LAYOUT_PARSER_PROCESSOR_ID/GOOGLE_LAYOUT_PARSER_PROCESSOR_ID or GCP_PROCESSOR_ID/GOOGLE_PROCESSOR_ID).',
      );
    }

    return `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  private logRawDocumentAiResult(
    processorName: string,
    document: protos.google.cloud.documentai.v1.IDocument | null | undefined,
  ) {
    console.log('[DocumentAI summary]', {
      processorName,
      hasDocument: Boolean(document),
      textLength: (document?.text ?? '').length,
      pages: document?.pages?.length ?? 0,
      formFields: (document?.pages ?? []).reduce(
        (acc, page) => acc + (page.formFields?.length ?? 0),
        0,
      ),
      entities: document?.entities?.length ?? 0,
      layoutBlocks: document?.documentLayout?.blocks?.length ?? 0,
      chunks: document?.chunkedDocument?.chunks?.length ?? 0,
    });

    const shouldLogRaw =
      String(process.env.OCR_LOG_RAW_DOCUMENT ?? '')
        .trim()
        .toLowerCase() === 'true';

    // if (shouldLogRaw) {
      console.log(
        '[DocumentAI raw document]',
        JSON.stringify(document ?? null, null, 2),
      );
    // }
  }

  private extractLinesFromDocument(
    document: protos.google.cloud.documentai.v1.IDocument,
    fullText: string,
  ): OcrLine[] {
    const linesFromPages = this.extractLinesFromPages(document, fullText);
    if (linesFromPages.length > 0) {
      return linesFromPages;
    }

    const linesFromLayout = this.extractLinesFromLayoutBlocks(document);
    if (linesFromLayout.length > 0) {
      return linesFromLayout;
    }

    return this.extractLinesFromChunks(document);
  }

  private extractLinesFromPages(
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

  private extractLinesFromLayoutBlocks(
    document: protos.google.cloud.documentai.v1.IDocument,
  ): OcrLine[] {
    const blocks = document.documentLayout?.blocks ?? [];
    const pages = document.pages ?? [];
    const lines: Array<OcrLine & { page: number }> = [];

    this.collectLinesFromLayoutBlocks(blocks, pages, lines, 1);

    return lines
      .sort((a, b) => {
        if (a.page !== b.page) {
          return a.page - b.page;
        }
        if (a.top !== b.top) {
          return a.top - b.top;
        }
        return a.left - b.left;
      })
      .map(({ page: _page, ...line }) => line);
  }

  private collectLinesFromLayoutBlocks(
    blocks: protos.google.cloud.documentai.v1.Document.DocumentLayout.IDocumentLayoutBlock[],
    pages: protos.google.cloud.documentai.v1.Document.IPage[],
    output: Array<OcrLine & { page: number }>,
    fallbackPage: number,
  ) {
    for (const block of blocks) {
      const page = Number(block.pageSpan?.pageStart ?? fallbackPage);
      const safePage = Number.isFinite(page) && page > 0 ? page : fallbackPage;
      const text = (block.textBlock?.text ?? '').replace(/\s+/g, ' ').trim();

      if (text) {
        const pageInfo = pages[safePage - 1];
        const pageWidth = Number(pageInfo?.dimension?.width ?? 0);
        const pageHeight = Number(pageInfo?.dimension?.height ?? 0);
        const box = this.getPixelBox(block.boundingBox, pageWidth, pageHeight);

        if (box) {
          output.push({
            text,
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            right: box.right,
            bottom: box.bottom,
            centerY: (box.top + box.bottom) / 2,
            page: safePage,
          });
        }
      }

      const children = block.textBlock?.blocks ?? [];
      if (children.length > 0) {
        this.collectLinesFromLayoutBlocks(children, pages, output, safePage);
      }
    }
  }

  private extractLinesFromChunks(
    document: protos.google.cloud.documentai.v1.IDocument,
  ): OcrLine[] {
    const chunks = document.chunkedDocument?.chunks ?? [];
    const lines: OcrLine[] = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const content = (chunks[i].content ?? '').replace(/\s+/g, ' ').trim();
      if (!content) {
        continue;
      }

      lines.push({
        text: content,
        left: 0,
        top: i,
        width: 0,
        height: 0,
        right: 0,
        bottom: i,
        centerY: i,
      });
    }

    return lines;
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
    const pages = document.pages ?? [];
    return (document.entities ?? [])
      .map((entity) => {
        const pageRef = entity.pageAnchor?.pageRefs?.[0];
        const pageIndex = Number(pageRef?.page ?? 0);
        const pageInfo = pages[pageIndex];
        const pageWidth = Number(pageInfo?.dimension?.width ?? 0);
        const pageHeight = Number(pageInfo?.dimension?.height ?? 0);
        const box = this.getPixelBox(pageRef?.boundingPoly, pageWidth, pageHeight);

        return {
          type: entity.type ?? '',
          mentionText: (entity.mentionText ?? '').replace(/\s+/g, ' ').trim(),
          confidence: Number.isFinite(Number(entity.confidence))
            ? Number(entity.confidence)
            : null,
          left: box?.left,
          top: box?.top,
          right: box?.right,
          bottom: box?.bottom,
        };
      })
      .filter((entity) => entity.type.length > 0 || entity.mentionText.length > 0);
  }

  private extractTextFromDocument(
    document: protos.google.cloud.documentai.v1.IDocument,
    fullText: string,
  ): string {
    const direct = fullText.trim();
    if (direct) {
      return direct;
    }

    const blockTexts = (document.documentLayout?.blocks ?? [])
      .map((block) => (block.textBlock?.text ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (blockTexts.length > 0) {
      return blockTexts.join('\n');
    }

    const chunkTexts = (document.chunkedDocument?.chunks ?? [])
      .map((chunk) => (chunk.content ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (chunkTexts.length > 0) {
      return chunkTexts.join('\n');
    }

    return '';
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
    poly: protos.google.cloud.documentai.v1.IBoundingPoly | null | undefined,
    pageWidth: number,
    pageHeight: number,
  ): { left: number; top: number; width: number; height: number; right: number; bottom: number } | null {
    const normalized = poly?.normalizedVertices ?? [];
    if (normalized.length > 0) {
      const usePageDimensions = pageWidth > 0 && pageHeight > 0;
      const xs = normalized.map((v) =>
        usePageDimensions ? (v.x ?? 0) * pageWidth : Number(v.x ?? 0),
      );
      const ys = normalized.map((v) =>
        usePageDimensions ? (v.y ?? 0) * pageHeight : Number(v.y ?? 0),
      );
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
