'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

type VerificationFieldKey =
  | 'principalName'
  | 'purposeCourtName'
  | 'caseNumber'
  | 'itemName'
  | 'submissionInstitution'
  | 'agentName';

type VerificationFieldSettings = {
  entityKeywords: string[];
  formFieldLabels: string[];
  textFallbackLabel: string;
};

type VerificationSettings = {
  reviewThreshold: number;
  fields: Record<VerificationFieldKey, VerificationFieldSettings>;
};

type VerificationSettingsForm = {
  reviewThreshold: string;
  fields: Record<
    VerificationFieldKey,
    {
      entityKeywords: string;
      formFieldLabels: string;
      textFallbackLabel: string;
    }
  >;
};

type SubscriptionInfo = {
  planCode: string;
  planName: string;
  status: 'active' | 'past_due' | 'canceled';
  seats: number;
  nextBillingDate: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
};

type SubscriptionForm = {
  planCode: string;
  planName: string;
  status: SubscriptionInfo['status'];
  seats: string;
  nextBillingDate: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
};

type SettingsTab = 'parsing' | 'subscription';

const FIELD_META: Array<{ key: VerificationFieldKey; title: string }> = [
  { key: 'principalName', title: '회원이름' },
  { key: 'purposeCourtName', title: '용도 - 법원명' },
  { key: 'caseNumber', title: '용도 - 사건번호' },
  { key: 'itemName', title: '용도 - 물건명' },
  { key: 'submissionInstitution', title: '제출기관명' },
  { key: 'agentName', title: '대리인명' },
];

const emptyForm: VerificationSettingsForm = {
  reviewThreshold: '0.9',
  fields: {
    principalName: { entityKeywords: '', formFieldLabels: '', textFallbackLabel: '' },
    purposeCourtName: { entityKeywords: '', formFieldLabels: '', textFallbackLabel: '' },
    caseNumber: { entityKeywords: '', formFieldLabels: '', textFallbackLabel: '' },
    itemName: { entityKeywords: '', formFieldLabels: '', textFallbackLabel: '' },
    submissionInstitution: {
      entityKeywords: '',
      formFieldLabels: '',
      textFallbackLabel: '',
    },
    agentName: {
      entityKeywords: '',
      formFieldLabels: '',
      textFallbackLabel: '',
    },
  },
};

const emptySubscriptionForm: SubscriptionForm = {
  planCode: '',
  planName: '',
  status: 'active',
  seats: '1',
  nextBillingDate: '',
  autoRenew: true,
  cancelAtPeriodEnd: false,
};

function toMultiline(values: string[]) {
  return values.join('\n');
}

function fromMultiline(raw: string) {
  return raw
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFormData(settings: VerificationSettings): VerificationSettingsForm {
  return {
    reviewThreshold: String(settings.reviewThreshold),
    fields: {
      principalName: {
        entityKeywords: toMultiline(settings.fields.principalName.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.principalName.formFieldLabels),
        textFallbackLabel: settings.fields.principalName.textFallbackLabel,
      },
      purposeCourtName: {
        entityKeywords: toMultiline(settings.fields.purposeCourtName.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.purposeCourtName.formFieldLabels),
        textFallbackLabel: settings.fields.purposeCourtName.textFallbackLabel,
      },
      caseNumber: {
        entityKeywords: toMultiline(settings.fields.caseNumber.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.caseNumber.formFieldLabels),
        textFallbackLabel: settings.fields.caseNumber.textFallbackLabel,
      },
      itemName: {
        entityKeywords: toMultiline(settings.fields.itemName.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.itemName.formFieldLabels),
        textFallbackLabel: settings.fields.itemName.textFallbackLabel,
      },
      submissionInstitution: {
        entityKeywords: toMultiline(settings.fields.submissionInstitution.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.submissionInstitution.formFieldLabels),
        textFallbackLabel: settings.fields.submissionInstitution.textFallbackLabel,
      },
      agentName: {
        entityKeywords: toMultiline(settings.fields.agentName.entityKeywords),
        formFieldLabels: toMultiline(settings.fields.agentName.formFieldLabels),
        textFallbackLabel: settings.fields.agentName.textFallbackLabel,
      },
    },
  };
}

function toPayload(form: VerificationSettingsForm): VerificationSettings {
  return {
    reviewThreshold: Number(form.reviewThreshold),
    fields: {
      principalName: {
        entityKeywords: fromMultiline(form.fields.principalName.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.principalName.formFieldLabels),
        textFallbackLabel: form.fields.principalName.textFallbackLabel.trim(),
      },
      purposeCourtName: {
        entityKeywords: fromMultiline(form.fields.purposeCourtName.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.purposeCourtName.formFieldLabels),
        textFallbackLabel: form.fields.purposeCourtName.textFallbackLabel.trim(),
      },
      caseNumber: {
        entityKeywords: fromMultiline(form.fields.caseNumber.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.caseNumber.formFieldLabels),
        textFallbackLabel: form.fields.caseNumber.textFallbackLabel.trim(),
      },
      itemName: {
        entityKeywords: fromMultiline(form.fields.itemName.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.itemName.formFieldLabels),
        textFallbackLabel: form.fields.itemName.textFallbackLabel.trim(),
      },
      submissionInstitution: {
        entityKeywords: fromMultiline(form.fields.submissionInstitution.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.submissionInstitution.formFieldLabels),
        textFallbackLabel: form.fields.submissionInstitution.textFallbackLabel.trim(),
      },
      agentName: {
        entityKeywords: fromMultiline(form.fields.agentName.entityKeywords),
        formFieldLabels: fromMultiline(form.fields.agentName.formFieldLabels),
        textFallbackLabel: form.fields.agentName.textFallbackLabel.trim(),
      },
    },
  };
}

function toSubscriptionForm(data: SubscriptionInfo): SubscriptionForm {
  return {
    planCode: data.planCode,
    planName: data.planName,
    status: data.status,
    seats: String(data.seats),
    nextBillingDate: data.nextBillingDate,
    autoRenew: data.autoRenew,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
  };
}

function toSubscriptionPayload(form: SubscriptionForm): SubscriptionInfo {
  return {
    planCode: form.planCode.trim(),
    planName: form.planName.trim(),
    status: form.status,
    seats: Number(form.seats),
    nextBillingDate: form.nextBillingDate,
    autoRenew: form.autoRenew,
    cancelAtPeriodEnd: form.cancelAtPeriodEnd,
  };
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('parsing');

  const [form, setForm] = useState<VerificationSettingsForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [subscriptionForm, setSubscriptionForm] =
    useState<SubscriptionForm>(emptySubscriptionForm);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    const fetchParsingSettings = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/verification/settings`, {
          method: 'GET',
        });
        const data = (await response.json()) as VerificationSettings;

        if (!response.ok) {
          const maybeMessage = (data as { message?: string | string[] }).message;
          const message = Array.isArray(maybeMessage)
            ? maybeMessage.join(', ')
            : maybeMessage || '설정 조회 중 오류가 발생했습니다.';
          throw new Error(message);
        }

        setForm(toFormData(data));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchParsingSettings();
  }, [apiBaseUrl]);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/billing/subscription`, {
          method: 'GET',
        });
        const data = (await response.json()) as SubscriptionInfo;

        if (!response.ok) {
          const maybeMessage = (data as { message?: string | string[] }).message;
          const message = Array.isArray(maybeMessage)
            ? maybeMessage.join(', ')
            : maybeMessage || '구독 정보 조회 중 오류가 발생했습니다.';
          throw new Error(message);
        }

        setSubscriptionForm(toSubscriptionForm(data));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        );
      } finally {
        setSubscriptionLoading(false);
      }
    };

    fetchSubscription();
  }, [apiBaseUrl]);

  const handleThresholdChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((previous) => ({
      ...previous,
      reviewThreshold: event.target.value,
    }));
  };

  const handleFieldTextChange =
    (
      fieldKey: VerificationFieldKey,
      inputKey: 'entityKeywords' | 'formFieldLabels' | 'textFallbackLabel',
    ) =>
    (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      setForm((previous) => ({
        ...previous,
        fields: {
          ...previous.fields,
          [fieldKey]: {
            ...previous.fields[fieldKey],
            [inputKey]: event.target.value,
          },
        },
      }));
    };

  const handleParsingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setSaving(true);

      const response = await fetch(`${apiBaseUrl}/verification/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toPayload(form)),
      });
      const data = (await response.json()) as VerificationSettings;

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '설정 저장 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setForm(toFormData(data));
      setSuccessMessage('파싱 설정이 저장되었습니다. 이후 업로드부터 즉시 반영됩니다.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubscriptionChange =
    (key: keyof SubscriptionForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const target = event.target;
      const value =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? target.checked
          : target.value;

      setSubscriptionForm((previous) => ({
        ...previous,
        [key]: value,
      }));
    };

  const handleSubscriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setSubscriptionSaving(true);

      const response = await fetch(`${apiBaseUrl}/billing/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toSubscriptionPayload(subscriptionForm)),
      });
      const data = (await response.json()) as SubscriptionInfo;

      if (!response.ok) {
        const maybeMessage = (data as { message?: string | string[] }).message;
        const message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : maybeMessage || '구독 정보 저장 중 오류가 발생했습니다.';
        throw new Error(message);
      }

      setSubscriptionForm(toSubscriptionForm(data));
      setSuccessMessage('구독 정보가 저장되었습니다.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setSubscriptionSaving(false);
    }
  };

  return (
    <div className="page-wrap">
      <main className="container">
        <div className="page-actions">
          <Link href="/">업로드 화면</Link>
        </div>

        <h1>설정</h1>
        <div className="settings-tabs" role="tablist" aria-label="설정 탭">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'parsing'}
            className={tab === 'parsing' ? 'active' : ''}
            onClick={() => setTab('parsing')}
          >
            파싱 설정
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'subscription'}
            className={tab === 'subscription' ? 'active' : ''}
            onClick={() => setTab('subscription')}
          >
            구독 관리
          </button>
        </div>

        {tab === 'parsing' && (
          <>
            <p className="description">
              설정 저장 후 업로드 API(`POST /verification/upload`) 파싱 로직에 즉시 반영됩니다.
            </p>

            {loading && <p>설정 불러오는 중...</p>}
            {!loading && (
              <form className="settings-form" onSubmit={handleParsingSubmit}>
                <article className="card settings-card">
                  <h2>검토 임계값</h2>
                  <p className="field-help">
                    confidence 값이 이 숫자보다 작으면 `needsReview`가 `true`가 됩니다. (0~1)
                  </p>
                  <label className="field-group">
                    <span>reviewThreshold</span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={form.reviewThreshold}
                      onChange={handleThresholdChange}
                    />
                  </label>
                </article>

                {FIELD_META.map((field) => (
                  <article className="card settings-card" key={field.key}>
                    <h2>{field.title}</h2>
                    <label className="field-group">
                      <span>Entity 키워드 (줄바꿈 구분)</span>
                      <textarea
                        rows={4}
                        value={form.fields[field.key].entityKeywords}
                        onChange={handleFieldTextChange(field.key, 'entityKeywords')}
                      />
                    </label>

                    <label className="field-group">
                      <span>FormField 라벨 (줄바꿈 구분)</span>
                      <textarea
                        rows={4}
                        value={form.fields[field.key].formFieldLabels}
                        onChange={handleFieldTextChange(field.key, 'formFieldLabels')}
                      />
                    </label>

                    <label className="field-group">
                      <span>텍스트 폴백 라벨</span>
                      <input
                        type="text"
                        value={form.fields[field.key].textFallbackLabel}
                        onChange={handleFieldTextChange(field.key, 'textFallbackLabel')}
                      />
                    </label>
                  </article>
                ))}

                <button type="submit" disabled={saving}>
                  {saving ? '저장 중...' : '설정 저장'}
                </button>
              </form>
            )}
          </>
        )}

        {tab === 'subscription' && (
          <>
            <p className="description">
              구독 관리 탭은 `GET/PUT /billing/subscription` API와 연동됩니다.
            </p>

            {subscriptionLoading && <p>구독 정보 불러오는 중...</p>}
            {!subscriptionLoading && (
              <form className="settings-form" onSubmit={handleSubscriptionSubmit}>
                <article className="card settings-card">
                  <h2>구독 정보</h2>

                  <label className="field-group">
                    <span>Plan Code</span>
                    <input
                      type="text"
                      value={subscriptionForm.planCode}
                      onChange={handleSubscriptionChange('planCode')}
                    />
                  </label>

                  <label className="field-group">
                    <span>Plan Name</span>
                    <input
                      type="text"
                      value={subscriptionForm.planName}
                      onChange={handleSubscriptionChange('planName')}
                    />
                  </label>

                  <label className="field-group">
                    <span>Status</span>
                    <select
                      value={subscriptionForm.status}
                      onChange={handleSubscriptionChange('status')}
                    >
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                    </select>
                  </label>

                  <label className="field-group">
                    <span>Seats</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={subscriptionForm.seats}
                      onChange={handleSubscriptionChange('seats')}
                    />
                  </label>

                  <label className="field-group">
                    <span>Next Billing Date</span>
                    <input
                      type="date"
                      value={subscriptionForm.nextBillingDate}
                      onChange={handleSubscriptionChange('nextBillingDate')}
                    />
                  </label>

                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      checked={subscriptionForm.autoRenew}
                      onChange={handleSubscriptionChange('autoRenew')}
                    />
                    <span>Auto Renew</span>
                  </label>

                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      checked={subscriptionForm.cancelAtPeriodEnd}
                      onChange={handleSubscriptionChange('cancelAtPeriodEnd')}
                    />
                    <span>Cancel At Period End</span>
                  </label>
                </article>

                <button type="submit" disabled={subscriptionSaving}>
                  {subscriptionSaving ? '저장 중...' : '구독 정보 저장'}
                </button>
              </form>
            )}
          </>
        )}

        {errorMessage && <p className="error-message">에러: {errorMessage}</p>}
        {successMessage && <p className="success-message">{successMessage}</p>}
      </main>
    </div>
  );
}
