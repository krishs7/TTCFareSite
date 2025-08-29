import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { API_BASE } from './apiBase.js';
import { formatHMS } from './time.js';

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
  const pretty = formatHMS(msLeft); // <-- FIX: show H:MM:SS when needed
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
    <section style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, margin: '8px 0' }}>{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
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
    <main style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, margin: '8px 0' }}>One-Fare Helper</h1>
        <p style={{ color: '#555', margin: 0 }}>A quick timer + eligibility check for TTC ⇄ GO/905 transfers.</p>
      </header>

      <Section title="Direction">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setDirection(Directions.TTC_GO); setStartAgency(Agencies.TTC); }} aria-pressed={direction === Directions.TTC_GO}>TTC → GO</button>
          <button onClick={() => { setDirection(Directions.GO_TTC); setStartAgency(Agencies.GO); }} aria-pressed={direction === Directions.GO_TTC}>GO → TTC</button>
          <button onClick={() => { setDirection(Directions.TTC_905); setStartAgency(Agencies.TTC); }} aria-pressed={direction === Directions.TTC_905}>TTC ⇄ 905 Local</button>
        </div>
      </Section>

      <Section title="Starting agency">
        <select value={startAgency} onChange={e => setStartAgency(e.target.value)}>
          {agenciesForDirection.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </Section>

      <Section title="Payment method">
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
          <option value={PaymentMethods.PRESTO_CARD}>PRESTO Card</option>
          <option value={PaymentMethods.PRESTO_GOOGLE_WALLET}>PRESTO in Google Wallet</option>
          <option value={PaymentMethods.CREDIT}>Credit</option>
          <option value={PaymentMethods.DEBIT}>Debit</option>
          <option value={PaymentMethods.PRESTO_TICKET}>PRESTO Ticket (paper)</option>
          <option value={PaymentMethods.E_TICKET}>E-ticket</option>
        </select>
      </Section>

      <Section title="Same card across taps?">
        <label>
          <input type="checkbox" checked={sameCard} onChange={e => setSameCard(e.target.checked)} />
          Yes — I’ll use the same card/phone/watch for all taps
        </label>
      </Section>

      <Section title="Backdate (if you forgot)">
        <input type="number" min="0" max="10" value={backdateMin} onChange={e => setBackdateMin(e.target.value)} style={{ width: 80 }} /> minutes ago
      </Section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={onStartTap}>I just tapped</button>
        {result && <button onClick={reset}>Reset</button>}
      </div>

      {errorMsg && (
        <div role="alert" style={{ color: '#b00', marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      {result && (
        <Section title="Status">
          <div role="status" aria-live="polite">
            <p style={{ margin: '8px 0', fontSize: 18 }}>
              {result.eligibleNow ? '✅ Eligible'
                : (result.reasons.length ? '❌ Not eligible'
                  : (expired ? '❌ Window expired' : '❌ Not eligible'))}
            </p>
            <p style={{ margin: '8px 0' }}>{result.savingsText}</p>
            <p style={{ margin: '8px 0' }}>
              First tap: <strong>{firstTapISO ? dayjs(firstTapISO).format('MMM D, HH:mm:ss') : '-'}</strong>
            </p>
            <p style={{ margin: '8px 0' }}>
              Tap-by deadline: <strong>{result.deadlineISO ? dayjs(result.deadlineISO).format('MMM D, HH:mm:ss') : '-'}</strong>
            </p>
            <p style={{ margin: '8px 0', fontSize: 28 }}>
              ⏱️ {expired ? '00:00' : pretty}
            </p>
            {!result.eligibleNow && result.reasons.length > 0 && (
              <ul>{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            )}
            {expired && result.expiredNextSteps && (
              <p style={{ color: '#b00' }}>{result.expiredNextSteps}</p>
            )}
          </div>
        </Section>
      )}

      <footer style={{ marginTop: 24, color: '#666' }}>
        <small>Runs entirely on your device. No PRESTO login or personal data required.</small>
      </footer>
    </main>
  );
}

