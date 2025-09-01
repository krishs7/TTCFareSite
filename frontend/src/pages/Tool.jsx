import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { API_BASE } from '../apiBase.js';
import { formatHMS } from '../time.js';
import { startSmsVerification, verifySmsCode, scheduleSmsReminders, getSmsRecipientId } from '../sms-client.js';
import { makeIcs, downloadIcs } from '../makeIcs.js';

const Agencies = {
  TTC: 'TTC',
  GO: 'GO',
  BRAMPTON: 'BRAMPTON',
  DRT: 'DRT',
  MIWAY: 'MIWAY',
  YRT: 'YRT'
};
const Directions = { TTC_GO: 'TTC_GO', GO_TTC: 'GO_TTC', TTC_905: 'TTC_905' };
const PaymentMethods = {
  PRESTO_CARD: 'PRESTO_CARD',
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  PRESTO_GOOGLE_WALLET: 'PRESTO_GOOGLE_WALLET',
  PRESTO_TICKET: 'PRESTO_TICKET',
  E_TICKET: 'E_TICKET'
};
const localAgencies = [Agencies.TTC, Agencies.BRAMPTON, Agencies.DRT, Agencies.MIWAY, Agencies.YRT];

function useCountdown(deadlineISO) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadlineISO) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineISO]);
  if (!deadlineISO) return { msLeft: 0, expired: false, pretty: '' };
  const msLeft = Math.max(0, new Date(deadlineISO).getTime() - now);
  const expired = msLeft <= 0;
  const pretty = formatHMS(msLeft);
  return { msLeft, expired, pretty };
}

async function checkEligibility(payload) {
  const res = await fetch(`${API_BASE}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`API error ${res.status}: ${t || res.statusText}`);
  }
  return res.json();
}

function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}

function SmsEnroll() {
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [phase, setPhase] = React.useState(() => (getSmsRecipientId() ? 'verified' : 'idle'));
  const [msg, setMsg] = React.useState('');

  const clean = s => s.replace(/[^\d+]/g, '');
  const onStart = async () => {
    setMsg('');
    try {
      await startSmsVerification(clean(phone));
      setPhase('code');
      setMsg('Code sent. Check your texts.');
    } catch (e) {
      setMsg(String(e.message || e));
    }
  };
  const onVerify = async () => {
    setMsg('');
    try {
      await verifySmsCode(clean(phone), code.trim());
      setPhase('verified');
      setMsg('Number verified ✅');
    } catch (e) {
      setMsg(String(e.message || e));
    }
  };

  if (phase === 'verified') {
    return <div className="text-green-700">SMS alerts enabled for this device.</div>;
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start">
      {phase !== 'code' ? (
        <>
          <input
            className="w-64 rounded-xl border border-slate-300 px-3 py-2"
            placeholder="+16475551234"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            inputMode="tel"
          />
          <button className="btn btn-ghost" onClick={onStart}>Send code</button>
        </>
      ) : (
        <>
          <input
            className="w-40 rounded-xl border border-slate-300 px-3 py-2"
            placeholder="6-digit code"
            value={code}
            onChange={e => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
          />
          <button className="btn btn-ghost" onClick={onVerify}>Verify</button>
        </>
      )}
      {msg && <div className="text-slate-600">{msg}</div>}
    </div>
  );
}


export default function Tool() {
  const [direction, setDirection] = useState(() => localStorage.getItem('dir') || Directions.TTC_GO);
  const [startAgency, setStartAgency] = useState(Agencies.TTC);
  const [paymentMethod, setPaymentMethod] = useState(PaymentMethods.PRESTO_CARD);
  const [sameCard, setSameCard] = useState(true);
  const [backdateMin, setBackdateMin] = useState(0);

  const [result, setResult] = useState(null);
  const [firstTapISO, setFirstTapISO] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { expired, pretty } = useCountdown(result?.deadlineISO);

  useEffect(() => { localStorage.setItem('dir', direction); }, [direction]);

  const scheduledRef = useRef({ five: false, one: false });
  useEffect(() => {
    if (!result?.deadlineISO) return;
    const deadline = new Date(result.deadlineISO).getTime();
    const maybeNotify = async (title, body) => {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission === 'granted') new Notification(title, { body });
      } catch {}
    };
    const id = setInterval(() => {
      const now = Date.now();
      const secLeft = Math.floor((deadline - now) / 1000);
      if (secLeft <= 60 && !scheduledRef.current.one) {
        scheduledRef.current.one = true;
        maybeNotify('One-Fare: 1 minute left', 'Tap before your window expires.');
      } else if (secLeft <= 300 && !scheduledRef.current.five) {
        scheduledRef.current.five = true;
        maybeNotify('One-Fare: 5 minutes left', 'Tap soon to keep your discount.');
      }
      if (secLeft <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [result?.deadlineISO]);

  const agenciesForDirection = useMemo(() => {
    if (direction === Directions.GO_TTC) return [Agencies.GO];
    if (direction === Directions.TTC_GO) return [Agencies.TTC];
    return localAgencies;
  }, [direction]);

  const onStartTap = async () => {
    setErrorMsg('');
    const start = dayjs().subtract(Number(backdateMin) || 0, 'minute').toISOString();
    try {
      const r = await checkEligibility({
        direction, startAgency, firstTapISO: start, paymentMethod, sameCard
      });
      setFirstTapISO(start);
      setResult(r);
      scheduledRef.current = { five: false, one: false };
      try {
        if (r?.deadlineISO) {
          try { await scheduleSmsReminders(r.deadlineISO); } catch {}
        }

      } catch {}
    } catch (e) {
      if (import.meta.env.MODE !== 'test') console.error(e);
      setErrorMsg(String(e.message || e));
    }
  };

  const reset = () => {
    setResult(null);
    setFirstTapISO(null);
    setErrorMsg('');
    scheduledRef.current = { five: false, one: false };
  };

  return (
    <div className="container-narrow py-8">
      <div className="card p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">One-Fare Helper</h1>
          <p className="text-slate-600">Quick timer + eligibility for TTC ⇄ GO/905 transfers.</p>
        </header>

        <Section title="Direction">
          <div className="flex flex-wrap gap-2">
            <button
              className={`btn ${direction===Directions.TTC_GO?'btn-primary':'btn-ghost'}`}
              onClick={() => { setDirection(Directions.TTC_GO); setStartAgency(Agencies.TTC); }}
              aria-pressed={direction === Directions.TTC_GO}
            >TTC → GO</button>
            <button
              className={`btn ${direction===Directions.GO_TTC?'btn-primary':'btn-ghost'}`}
              onClick={() => { setDirection(Directions.GO_TTC); setStartAgency(Agencies.GO); }}
              aria-pressed={direction === Directions.GO_TTC}
            >GO → TTC</button>
            <button
              className={`btn ${direction===Directions.TTC_905?'btn-primary':'btn-ghost'}`}
              onClick={() => { setDirection(Directions.TTC_905); setStartAgency(Agencies.TTC); }}
              aria-pressed={direction === Directions.TTC_905}
            >TTC ⇄ 905 Local</button>
          </div>
        </Section>

        <div className="grid sm:grid-cols-2 gap-6">
          <Section title="Starting agency">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={startAgency}
              onChange={e => setStartAgency(e.target.value)}
            >
              {agenciesForDirection.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Section>

          <Section title="Payment method">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              <option value={PaymentMethods.PRESTO_CARD}>PRESTO Card</option>
              <option value={PaymentMethods.PRESTO_GOOGLE_WALLET}>PRESTO in Google Wallet</option>
              <option value={PaymentMethods.CREDIT}>Credit</option>
              <option value={PaymentMethods.DEBIT}>Debit</option>
              <option value={PaymentMethods.PRESTO_TICKET}>PRESTO Ticket (paper)</option>
              <option value={PaymentMethods.E_TICKET}>E-ticket</option>
            </select>
          </Section>
        </div>

        <Section title="Same card across taps?">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={sameCard} onChange={e => setSameCard(e.target.checked)} />
            <span>Yes — I’ll use the same card/phone/watch for all taps</span>
          </label>
        </Section>

        <Section title="Backdate (if you forgot)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="10"
              value={backdateMin}
              onChange={e => setBackdateMin(e.target.value)}
              className="w-24 rounded-xl border border-slate-300 px-3 py-2"
            />
            <span>minutes ago</span>
          </div>
        </Section>
        <Section title="Alerts (choose one)">
          <div className="grid gap-4">
            {/* SMS (optional; free while testing with a Twilio trial) */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold mb-2">Text alerts (SMS)</h3>
              <p className="text-slate-600 mb-3">
                Get T-5 and T-1 messages even if the app is closed. For now, SMS is available for your own verified number during testing.
              </p>
              <SmsEnroll />
            </div>

            {/* Always-free, production-safe */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold mb-2">Calendar alerts (free)</h3>
              <p className="text-slate-600 mb-3">
                Add an event with 5-minute and 1-minute reminders to your phone’s calendar.
              </p>
              <button
                className="btn btn-ghost"
                disabled={!result?.deadlineISO}
                onClick={() => {
                  if (!result?.deadlineISO) return;
                  const ics = makeIcs(result.deadlineISO);
                  downloadIcs('one-fare-reminder.ics', ics);
                }}
              >
                Add calendar alerts
              </button>
            </div>
          </div>
        </Section>


        <div className="flex gap-2 mb-4">
          <button className="btn btn-primary" onClick={onStartTap}>I just tapped</button>
          {result && <button className="btn btn-ghost" onClick={reset}>Reset</button>}
        </div>

        {errorMsg && (
          <div role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            {errorMsg}
          </div>
        )}

        {result && (
          <Section title="Status">
            <div role="status" aria-live="polite" className="grid gap-2">
              <p className="text-lg">
                {result.eligibleNow ? '✅ Eligible'
                  : (result.reasons.length ? '❌ Not eligible'
                    : (expired ? '❌ Window expired' : '❌ Not eligible'))}
              </p>
              <p className="text-slate-700">{result.savingsText}</p>
              <p>First tap: <strong>{firstTapISO ? dayjs(firstTapISO).format('MMM D, HH:mm:ss') : '-'}</strong></p>
              <p>Tap-by deadline: <strong>{result.deadlineISO ? dayjs(result.deadlineISO).format('MMM D, HH:mm:ss') : '-'}</strong></p>
              <p className="text-3xl">⏱️ {expired ? '00:00' : pretty}</p>
              {!result.eligibleNow && result.reasons.length > 0 && (
                <ul className="list-disc pl-5">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              )}
              {expired && result.expiredNextSteps && (
                <p className="text-red-700">{result.expiredNextSteps}</p>
              )}
            </div>
          </Section>
        )}

        <footer className="mt-4 text-slate-500 text-sm">
          Runs entirely on your device. No PRESTO login or personal data required.
        </footer>
      </div>
    </div>
  );
}

