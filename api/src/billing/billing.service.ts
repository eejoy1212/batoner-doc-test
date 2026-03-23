import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export type SubscriptionInfo = {
  planCode: string;
  planName: string;
  status: 'active' | 'past_due' | 'canceled';
  seats: number;
  nextBillingDate: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
};

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  planCode: 'pro-monthly',
  planName: 'Pro Monthly',
  status: 'active',
  seats: 5,
  nextBillingDate: '2026-04-01',
  autoRenew: true,
  cancelAtPeriodEnd: false,
};

@Injectable()
export class BillingService {
  private readonly dataPath = join(process.cwd(), 'data', 'subscription.json');
  private cache: SubscriptionInfo | null = null;

  async getSubscription(): Promise<SubscriptionInfo> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await fs.readFile(this.dataPath, 'utf8');
      const parsed = this.normalize(JSON.parse(raw) as unknown, DEFAULT_SUBSCRIPTION);
      this.cache = parsed;
      return parsed;
    } catch {
      await this.persist(DEFAULT_SUBSCRIPTION);
      this.cache = DEFAULT_SUBSCRIPTION;
      return DEFAULT_SUBSCRIPTION;
    }
  }

  async updateSubscription(input: unknown): Promise<SubscriptionInfo> {
    const current = await this.getSubscription();
    const merged = this.normalize(input, current);
    await this.persist(merged);
    this.cache = merged;
    return merged;
  }

  private async persist(data: SubscriptionInfo) {
    await fs.mkdir(dirname(this.dataPath), { recursive: true });
    await fs.writeFile(this.dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  private normalize(input: unknown, fallback: SubscriptionInfo): SubscriptionInfo {
    const value =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};

    return {
      planCode: this.toString(value.planCode, fallback.planCode),
      planName: this.toString(value.planName, fallback.planName),
      status: this.toStatus(value.status, fallback.status),
      seats: this.toSeats(value.seats, fallback.seats),
      nextBillingDate: this.toDateString(value.nextBillingDate, fallback.nextBillingDate),
      autoRenew: this.toBoolean(value.autoRenew, fallback.autoRenew),
      cancelAtPeriodEnd: this.toBoolean(
        value.cancelAtPeriodEnd,
        fallback.cancelAtPeriodEnd,
      ),
    };
  }

  private toString(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value !== 'boolean') {
      return fallback;
    }
    return value;
  }

  private toSeats(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(1, Math.floor(numeric));
  }

  private toDateString(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return fallback;
    }
    return trimmed;
  }

  private toStatus(
    value: unknown,
    fallback: SubscriptionInfo['status'],
  ): SubscriptionInfo['status'] {
    if (value === 'active' || value === 'past_due' || value === 'canceled') {
      return value;
    }
    return fallback;
  }
}
