import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

type VerificationFieldKey =
  | 'principalName'
  | 'purposeCourtName'
  | 'caseNumber'
  | 'itemName'
  | 'submissionInstitution'
  | 'agentName';

export type VerificationFieldSettings = {
  entityKeywords: string[];
  formFieldLabels: string[];
  textFallbackLabel: string;
};

export type VerificationSettings = {
  reviewThreshold: number;
  fields: Record<VerificationFieldKey, VerificationFieldSettings>;
};

const DEFAULT_SETTINGS: VerificationSettings = {
  reviewThreshold: 0.9,
  fields: {
    principalName: {
      entityKeywords: ['name', '성명', 'person'],
      formFieldLabels: ['성명'],
      textFallbackLabel: '성명',
    },
    purposeCourtName: {
      entityKeywords: ['courtName', 'court_name', '법원명', '법원', 'court'],
      formFieldLabels: ['법원명', '관할법원'],
      textFallbackLabel: '법원명',
    },
    caseNumber: {
      entityKeywords: ['caseNumber', 'case_number', '사건번호'],
      formFieldLabels: ['사건번호', '사건 번호'],
      textFallbackLabel: '사건번호',
    },
    itemName: {
      entityKeywords: ['itemName', 'item_name', '물건명', '물건번호'],
      formFieldLabels: ['물건명', '물건 번호', '물건번호'],
      textFallbackLabel: '물건명',
    },
    submissionInstitution: {
      entityKeywords: ['institution', '제출기관', 'organization'],
      formFieldLabels: ['전자본인서명확인서 제출기관', '제출기관'],
      textFallbackLabel: '제출기관',
    },
    agentName: {
      entityKeywords: ['batoner', '위임받은사람', '수임인', '대리인', 'agent'],
      formFieldLabels: ['위임받은 사람', '위임받은사람', '대리인명', '대리인'],
      textFallbackLabel: '대리인',
    },
  },
};

@Injectable()
export class VerificationSettingsService {
  private readonly settingsFilePath = join(
    process.cwd(),
    'data',
    'verification-settings.json',
  );

  private cache: VerificationSettings | null = null;

  async getSettings(): Promise<VerificationSettings> {
    if (this.cache) {
      return this.cache;
    }

    const loaded = await this.loadSettings();
    this.cache = loaded;
    return loaded;
  }

  async updateSettings(rawInput: unknown): Promise<VerificationSettings> {
    const previous = await this.getSettings();
    const merged = this.mergeSettings(previous, rawInput);
    await this.persist(merged);
    this.cache = merged;
    return merged;
  }

  private async loadSettings(): Promise<VerificationSettings> {
    try {
      const raw = await fs.readFile(this.settingsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return this.mergeSettings(DEFAULT_SETTINGS, parsed);
    } catch {
      await this.persist(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
  }

  private async persist(settings: VerificationSettings) {
    await fs.mkdir(dirname(this.settingsFilePath), { recursive: true });
    await fs.writeFile(
      this.settingsFilePath,
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf8',
    );
  }

  private mergeSettings(
    base: VerificationSettings,
    rawInput: unknown,
  ): VerificationSettings {
    const input = this.toRecord(rawInput);
    const fieldsInput = this.toRecord(input.fields);

    return {
      reviewThreshold: this.normalizeThreshold(
        input.reviewThreshold,
        base.reviewThreshold,
      ),
      fields: {
        principalName: this.mergeField(
          base.fields.principalName,
          fieldsInput.principalName,
        ),
        purposeCourtName: this.mergeField(
          base.fields.purposeCourtName,
          fieldsInput.purposeCourtName,
        ),
        caseNumber: this.mergeField(
          base.fields.caseNumber,
          fieldsInput.caseNumber,
        ),
        itemName: this.mergeField(base.fields.itemName, fieldsInput.itemName),
        submissionInstitution: this.mergeField(
          base.fields.submissionInstitution,
          fieldsInput.submissionInstitution,
        ),
        agentName: this.mergeField(
          base.fields.agentName,
          fieldsInput.agentName,
        ),
      },
    };
  }

  private mergeField(
    base: VerificationFieldSettings,
    rawInput: unknown,
  ): VerificationFieldSettings {
    const input = this.toRecord(rawInput);
    return {
      entityKeywords: this.normalizeStringList(
        input.entityKeywords,
        base.entityKeywords,
      ),
      formFieldLabels: this.normalizeStringList(
        input.formFieldLabels,
        base.formFieldLabels,
      ),
      textFallbackLabel: this.normalizeString(
        input.textFallbackLabel,
        base.textFallbackLabel,
      ),
    };
  }

  private normalizeThreshold(input: unknown, fallback: number): number {
    const num = Number(input);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    if (num < 0) {
      return 0;
    }
    if (num > 1) {
      return 1;
    }
    return Number(num.toFixed(2));
  }

  private normalizeStringList(input: unknown, fallback: string[]): string[] {
    if (!Array.isArray(input)) {
      return fallback;
    }

    const normalized = input
      .map((item) => this.normalizeString(item, ''))
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    return unique.length > 0 ? unique : fallback;
  }

  private normalizeString(input: unknown, fallback: string): string {
    if (typeof input !== 'string') {
      return fallback;
    }
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
