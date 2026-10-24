'use client';
import { Alert, Badge, Button, Card, CardBody, Checkbox, Field, Icon, Input, KeyValue, Select, Spinner, cn } from '@aureon/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { OnboardingStatus } from '@/lib/types';

type Step = 'security' | 'profile' | 'disclosures' | 'review';
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'security', label: 'Security' },
  { key: 'profile', label: 'Profile' },
  { key: 'disclosures', label: 'Disclosures' },
  { key: 'review', label: 'Review' },
];

function SecurityStep({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (codes) {
    return (
      <div className="space-y-4">
        <Alert tone="positive" title="Two-factor authentication is on">Save these one-time recovery codes somewhere safe. They're shown only once.</Alert>
        <ul className="num grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-4 text-[14px] sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <Button onClick={onDone}>I've saved my codes</Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-[14px] text-muted">Two-factor authentication is required for every brokerage account. Use any standard authenticator app (time-based codes).</p>
      {!setup ? (
        <Button loading={busy} onClick={async () => { setBusy(true); try { setSetup(await api('/v1/auth/mfa/setup', { method: 'POST' })); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); } setBusy(false); }}>
          <Icon name="shield" size={16} />Set up authenticator
        </Button>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { const r = await api<{ recoveryCodes: string[] }>('/v1/auth/mfa/enable', { body: { code } }); setCodes(r.recoveryCodes); }
          catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); } finally { setBusy(false); }
        }}>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-[13px] text-muted">Add this key to your authenticator app, or <a className="text-accent-strong underline" href={setup.otpauthUri}>open it directly</a> on this device.</p>
            <p className="num mt-2 break-all text-[15px] tracking-[0.12em]">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
          </div>
          <Field label="6-digit code" htmlFor="totp" error={error}>
            <Input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num max-w-[200px] tracking-[0.3em]" />
          </Field>
          <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify and enable</Button>
        </form>
      )}
      {error && !setup ? <Alert tone="negative">{error}</Alert> : null}
    </div>
  );
}

const SELECTS: Record<string, Array<[string, string]>> = {
  employmentStatus: [['employed', 'Employed'], ['self_employed', 'Self-employed'], ['unemployed', 'Not employed'], ['retired', 'Retired'], ['student', 'Student']],
  annualIncomeBand: [['<25k', 'Under $25k'], ['25k-50k', '$25k–50k'], ['50k-100k', '$50k–100k'], ['100k-250k', '$100k–250k'], ['>250k', 'Over $250k']],
  netWorthBand: [['<25k', 'Under $25k'], ['25k-100k', '$25k–100k'], ['100k-500k', '$100k–500k'], ['500k-1m', '$500k–1m'], ['>1m', 'Over $1m']],
  investmentExperience: [['none', 'None'], ['limited', 'Limited'], ['good', 'Good'], ['extensive', 'Extensive']],
  riskTolerance: [['conservative', 'Conservative'], ['moderate', 'Moderate'], ['aggressive', 'Aggressive']],
  fundingSource: [['employment_income', 'Employment income'], ['savings', 'Savings'], ['investments', 'Investments'], ['business_income', 'Business income'], ['inheritance', 'Inheritance'], ['family', 'Family']],
};

function ProfileStep({ status, onSaved }: { status: OnboardingStatus; onSaved: () => void }) {
  const p = status.profile ?? {};
  const { data: countries } = useApi<Array<{ code: string; name: string }>>('/v1/public/jurisdictions');
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const v = (k: string) => (p[k] === null || p[k] === undefined ? '' : String(p[k]));
  const text = (k: string, lbl: string, opts: { type?: string; autoComplete?: string; optional?: boolean; hint?: string } = {}) => (
    <Field label={lbl} htmlFor={k} optional={opts.optional} hint={opts.hint}><Input id={k} name={k} type={opts.type ?? 'text'} defaultValue={v(k)} autoComplete={opts.autoComplete} required={!opts.optional} /></Field>
  );
  const select = (k: string, lbl: string, options: Array<[string, string]>) => (
    <Field label={lbl} htmlFor={k}><Select id={k} name={k} defaultValue={v(k)} required><option value="" disabled>Select…</option>{options.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
  );
  const country = (k: string, lbl: string) => select(k, lbl, (countries ?? []).map((c) => [c.code, c.name]));
  const yesno = (k: string, lbl: string, desc: string) => (
    <Field label={lbl} htmlFor={k} hint={desc}><Select id={k} name={k} defaultValue={p[k] === true ? 'true' : p[k] === false ? 'false' : ''} required><option value="" disabled>Select…</option><option value="false">No</option><option value="true">Yes</option></Select></Field>
  );
  return (
    <form className="space-y-8" onSubmit={async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      setBusy(true); setError(null);
      const body: Record<string, unknown> = { ...f };
      for (const k of ['isPoliticallyExposed', 'isControlPerson', 'isAffiliatedExchange']) body[k] = f[k] === 'true';
      for (const k of ['addressLine2', 'region', 'taxId']) if (!f[k]) delete body[k];
      try {
        const r = await api<{ eligibility: { eligible: boolean; reasons: string[] } }>('/v1/onboarding/profile', { method: 'PUT', body });
        if (!r.eligibility.eligible) setWarn(r.eligibility.reasons); else onSaved();
      } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); } finally { setBusy(false); }
    }}>
      {error ? <Alert tone="negative">{error}</Alert> : null}
      {warn ? <Alert tone="warning" title="You may not be eligible">{warn.join(' ')}</Alert> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Legal identity</legend>
        {text('legalFirstName', 'Legal first name', { autoComplete: 'given-name' })}
        {text('legalLastName', 'Legal last name', { autoComplete: 'family-name' })}
        {text('dateOfBirth', 'Date of birth', { type: 'date', autoComplete: 'bday' })}
        {country('nationality', 'Nationality')}
        {text('taxId', 'Tax identification number', { optional: !!p.taxIdLast4, hint: p.taxIdLast4 ? `On file ending ${p.taxIdLast4}. Leave blank to keep.` : 'SSN, National Insurance number or local TIN. Encrypted at rest.' })}
        {text('phone', 'Mobile phone', { type: 'tel', autoComplete: 'tel', hint: 'International format, e.g. +447700900123' })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Residential address</legend>
        <div className="sm:col-span-2">{text('addressLine1', 'Address line 1', { autoComplete: 'address-line1' })}</div>
        <div className="sm:col-span-2">{text('addressLine2', 'Address line 2', { autoComplete: 'address-line2', optional: true })}</div>
        {text('city', 'City', { autoComplete: 'address-level2' })}
        {text('region', 'State / region', { autoComplete: 'address-level1', optional: true })}
        {text('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
        {country('residenceCountry', 'Country of residence')}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Financial profile</legend>
        {select('employmentStatus', 'Employment status', SELECTS.employmentStatus!)}
        {select('fundingSource', 'Main source of funds', SELECTS.fundingSource!)}
        {select('annualIncomeBand', 'Annual income', SELECTS.annualIncomeBand!)}
        {select('netWorthBand', 'Net worth (excluding home)', SELECTS.netWorthBand!)}
        {select('investmentExperience', 'Investment experience', SELECTS.investmentExperience!)}
        {select('riskTolerance', 'Risk tolerance', SELECTS.riskTolerance!)}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Regulatory declarations</legend>
        {yesno('isPoliticallyExposed', 'Politically exposed person?', 'You or a close relative hold a prominent public position.')}
        {yesno('isControlPerson', 'Control person?', 'Director, officer or 10%+ shareholder of a listed company.')}
        {yesno('isAffiliatedExchange', 'Exchange / broker affiliation?', 'Employed by an exchange, broker-dealer or regulator.')}
      </fieldset>
      <Button type="submit" size="lg" loading={busy}>Save and continue</Button>
    </form>
  );
}

function DisclosuresStep({ status, onDone }: { status: OnboardingStatus; onDone: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(Object.fromEntries(status.documents.map((d) => [d.key, d.accepted])));
  const [busy, setBusy] = useState(false);
  const all = status.documents.every((d) => checked[d.key]);
  return (
    <div className="space-y-5">
      <Alert tone="warning" title="Draft documents">These documents are placeholders pending legal review and, for the partner agreement, will be supplied by the licensed brokerage partner.</Alert>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {status.documents.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <Checkbox id={`doc-${d.key}`} checked={!!checked[d.key]} onChange={(e) => setChecked((c) => ({ ...c, [d.key]: e.target.checked }))}
              label={<>I have read and accept the <strong>{d.title}</strong></>} description={`Version ${d.version}`} />
            <Link href={`/legal/${d.key}`} target="_blank" className="flex shrink-0 items-center gap-1 text-[13px] text-accent-strong hover:underline">Read<Icon name="external" size={13} /></Link>
          </li>
        ))}
      </ul>
      <Button disabled={!all} loading={busy} onClick={async () => {
        setBusy(true);
        await api('/v1/onboarding/disclosures', { body: { documents: status.documents.map((d) => ({ key: d.key, version: d.version })) } });
        setBusy(false); onDone();
      }}>Accept and continue</Button>
    </div>
  );
}

function ReviewStep({ status, onSubmitted }: { status: OnboardingStatus; onSubmitted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = status.profile ?? {};
  return (
    <div className="space-y-5">
      <KeyValue items={[
        ['Legal name', `${p.legalFirstName ?? ''} ${p.legalLastName ?? ''}`], ['Date of birth', String(p.dateOfBirth ?? '—')],
        ['Residence', String(p.residenceCountry ?? '—')], ['Nationality', String(p.nationality ?? '—')], ['Tax ID', p.taxIdLast4 ? `•••• ${p.taxIdLast4}` : '—'],
        ['Address', `${p.addressLine1 ?? ''}, ${p.city ?? ''} ${p.postalCode ?? ''}`],
      ]} />
      <Alert tone="info">By submitting, you authorise us and our partners to verify your identity and screen against sanctions and PEP lists. Your account will be opened with our licensed brokerage partner if approved.</Alert>
      {error ? <Alert tone="negative">{error}</Alert> : null}
      <Button size="lg" loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await api('/v1/onboarding/submit', { method: 'POST' }); onSubmitted(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Submission failed'); } finally { setBusy(false); }
      }}>Submit application</Button>
    </div>
  );
}

function StatusView({ s }: { s: OnboardingStatus }) {
  const map: Record<string, { tone: 'positive' | 'warning' | 'negative' | 'info'; title: string; body: string }> = {
    kyc_pending: { tone: 'info', title: 'Verifying your identity', body: 'This usually takes a few minutes. We\'ll notify you when it\'s done.' },
    manual_review: { tone: 'warning', title: 'Additional review', body: 'Our compliance team is reviewing your application. This can take up to two business days. We may contact you for more information.' },
    approved: { tone: 'positive', title: 'Approved', body: s.brokerageAccount?.status === 'active' ? `Your brokerage account ${s.brokerageAccount.accountNumber ?? ''} is open.` : 'We\'re opening your account with our brokerage partner.' },
    rejected: { tone: 'negative', title: 'Application not approved', body: s.decisionReason ?? 'Please contact support.' },
    ineligible: { tone: 'negative', title: 'Not eligible', body: s.decisionReason ?? 'We are not able to serve you at this time.' },
  };
  const m = map[s.status] ?? map.kyc_pending!;
  return (
    <div className="space-y-5">
      <Alert tone={m.tone} title={m.title}>{m.body}</Alert>
      {s.status === 'approved' && s.brokerageAccount?.status === 'active' ? <Link href="/app/funding"><Button>Fund your account</Button></Link> : null}
      {['rejected', 'ineligible', 'manual_review'].includes(s.status) ? <Link href="/app/support"><Button variant="secondary">Contact support</Button></Link> : null}
    </div>
  );
}

export default function OnboardingPage() {
  const { data: s, reload } = useApi<OnboardingStatus>('/v1/onboarding', { refreshMs: 10_000 });
  const [step, setStep] = useState<Step | null>(null);
  useEffect(() => {
    if (!s || step) return;
    setStep(!s.steps.mfaEnabled ? 'security' : !s.steps.profileComplete ? 'profile' : !s.steps.disclosuresAccepted ? 'disclosures' : 'review');
  }, [s, step]);
  if (!s || !step) return <div className="flex justify-center py-20 text-muted"><Spinner /></div>;
  const submitted = s.status !== 'draft';
  const doneMap: Record<Step, boolean> = { security: s.steps.mfaEnabled, profile: s.steps.profileComplete, disclosures: s.steps.disclosuresAccepted, review: s.steps.submitted };
  const advance = async (next: Step) => { await reload(); setStep(next); };
  return (
    <>
      <PageHeader eyebrow="Account setup" title={submitted ? 'Application status' : 'Open your brokerage account'}
        description="Your account is held with our licensed brokerage partner. We collect the information regulators require to verify your identity and suitability." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Steps">
          {STEPS.map((st, i) => (
            <li key={st.key}>
              <button type="button" disabled={submitted || (i > 0 && !doneMap[STEPS[i - 1]!.key])} onClick={() => setStep(st.key)} aria-current={step === st.key && !submitted ? 'step' : undefined}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] disabled:cursor-default',
                  step === st.key && !submitted ? 'bg-surface font-medium shadow-sm ring-1 ring-border' : 'text-muted')}>
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', doneMap[st.key] ? 'bg-pos text-white' : 'border border-border-strong')}>
                  {doneMap[st.key] ? <Icon name="check" size={13} /> : i + 1}
                </span>
                {st.label}
              </button>
            </li>
          ))}
        </ol>
        <Card>
          <CardBody className="p-6 sm:p-8">
            {submitted ? <StatusView s={s} /> : (
              <>
                <h2 className="mb-1 text-[17px] font-semibold">{STEPS.find((x) => x.key === step)!.label}</h2>
                <div className="mb-6"><Badge tone="neutral">Step {STEPS.findIndex((x) => x.key === step) + 1} of 4</Badge></div>
                {step === 'security' ? (s.steps.mfaEnabled ? <div className="space-y-4"><Alert tone="positive">Two-factor authentication is enabled.</Alert><Button onClick={() => setStep('profile')}>Continue</Button></div> : <SecurityStep onDone={() => advance('profile')} />) : null}
                {step === 'profile' ? <ProfileStep status={s} onSaved={() => advance('disclosures')} /> : null}
                {step === 'disclosures' ? <DisclosuresStep status={s} onDone={() => advance('review')} /> : null}
                {step === 'review' ? <ReviewStep status={s} onSubmitted={() => reload()} /> : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
