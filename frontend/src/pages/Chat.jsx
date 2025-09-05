import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../apiBase.js';

const SYSTEMS = ['TTC','MiWay','Brampton','DRT','YRT'];
const INTENTS = ['Arrivals','Alerts'];

function Chip({ active, children, onClick }) {
  return (
    <button
      className={`px-3 py-1.5 rounded-full border ${active?'bg-slate-900 text-white border-slate-900':'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
      onClick={onClick}
    >{children}</button>
  );
}

function ResultCard({ data }) {
  if (!data) return null;
  if (data.arrivals) {
    return (
      <div className="rounded-xl border p-4 text-left">
        <div className="mb-2 text-sm text-slate-500">Source: {data.source === 'rt' ? 'Real-time' : 'Schedule'} • {new Date(data.generatedAt).toLocaleTimeString()}</div>
        {data.arrivals.length ? (
          <ul className="space-y-1">
            {data.arrivals.map((a,i)=>(
              <li key={i}>
                <strong>{a.routeShortName || '—'}</strong> {a.headsign ? `→ ${a.headsign}`:''} — <span className="font-mono">{new Date(a.when).toLocaleTimeString()}</span> {a.realtime && <span className="ml-2 text-xs px-1 rounded bg-emerald-100 text-emerald-700">RT</span>}
              </li>
            ))}
          </ul>
        ) : <div>No upcoming vehicles found.</div>}
      </div>
    );
  }
  if (data.items) {
    return (
      <div className="rounded-xl border p-4 text-left space-y-2">
        {data.items.length ? data.items.map(x=>(
          <div key={x.id} className="border-b pb-2 last:border-0">
            <div className="font-semibold">{x.headerText || 'Alert'}</div>
            {x.descriptionText && <div className="text-sm text-slate-700">{x.descriptionText}</div>}
            <div className="text-xs text-slate-500">{x.start ? new Date(x.start).toLocaleString() : ''}</div>
          </div>
        )) : <div>No active alerts.</div>}
      </div>
    );
  }
  return null;
}

export default function Chat() {
  const [text, setText] = useState('');
  const [system, setSystem] = useState('');
  const [intent, setIntent] = useState('');
  const [stopRef, setStopRef] = useState('');
  const [routeRef, setRouteRef] = useState('');
  const [result, setResult] = useState(null);
  const [missing, setMissing] = useState([]);

  async function parseAndMaybeAsk(q) {
    const r = await fetch(`${API_BASE}/api/chat/parse`, {
      method: 'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ text: q, sessionId: 'web' })
    }).then(r=>r.json());
    setMissing(r.missingSlots || []);
    if (r.slots?.agency) setSystem(r.slots.agency.toUpperCase());
    if (r.intent) setIntent(r.intent);
    if (r.slots?.stop_ref) setStopRef(r.slots.stop_ref);
    if (r.slots?.route_ref) setRouteRef(r.slots.route_ref);
    return r;
  }

  async function run() {
    setResult(null);
    const ag = system.toLowerCase();
    if (intent === 'arrivals') {
      const url = `${API_BASE}/api/transit/arrivals?agency=${encodeURIComponent(ag)}&stop_ref=${encodeURIComponent(stopRef)}`;
      setResult(await fetch(url).then(r=>r.json()));
    } else if (intent === 'alerts') {
      const url = `${API_BASE}/api/transit/alerts?agency=${encodeURIComponent(ag)}${routeRef?`&route_ref=${encodeURIComponent(routeRef)}`:''}`;
      setResult(await fetch(url).then(r=>r.json()));
    }
  }

  return (
    <div className="page">
      <div className="container-narrow py-10 text-left">
        <h1 className="text-2xl font-bold mb-2">Transit Chat (beta)</h1>
        <p className="text-slate-600 mb-4">GTA-focused bot (TTC, MiWay, Brampton, DRT, YRT). Real-time when available, otherwise schedules.</p>

        <div className="mb-3 flex gap-2 flex-wrap">
          {SYSTEMS.map(s => <Chip key={s} active={system===s} onClick={()=>setSystem(s)}>{s}</Chip>)}
        </div>
        <div className="mb-5 flex gap-2 flex-wrap">
          {INTENTS.map(i => <Chip key={i} active={intent===i.toLowerCase()} onClick={()=>setIntent(i.toLowerCase())}>{i}</Chip>)}
        </div>

        <div className="flex gap-2 mb-3">
          <input className="flex-1 rounded-xl border px-3 py-2" placeholder="Ask anything… e.g., 'TTC arrivals at stop 5183'" value={text} onChange={e=>setText(e.target.value)} />
          <button className="btn btn-ghost" onClick={async ()=>{ await parseAndMaybeAsk(text); }}>Parse</button>
        </div>

        {/* Slot prompts */}
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs mb-1">System</label>
            <select className="w-full rounded-xl border px-3 py-2" value={system} onChange={e=>setSystem(e.target.value)}>
              <option value="">Select…</option>
              {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Intent</label>
            <select className="w-full rounded-xl border px-3 py-2" value={intent} onChange={e=>setIntent(e.target.value)}>
              <option value="">Select…</option>
              <option value="arrivals">Arrivals</option>
              <option value="alerts">Alerts</option>
            </select>
          </div>
          {intent === 'arrivals' ? (
            <div>
              <label className="block text-xs mb-1">Stop (name or ID)</label>
              <input className="w-full rounded-xl border px-3 py-2" placeholder="e.g., 5183 or Queen & Bathurst" value={stopRef} onChange={e=>setStopRef(e.target.value)} />
            </div>
          ) : intent === 'alerts' ? (
            <div>
              <label className="block text-xs mb-1">Route (optional)</label>
              <input className="w-full rounded-xl border px-3 py-2" placeholder="e.g., 504" value={routeRef} onChange={e=>setRouteRef(e.target.value)} />
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={run} disabled={!system || !intent || (intent==='arrivals' && !stopRef)}>Ask</button>
          {missing.length > 0 && <div className="text-sm text-slate-600 self-center">Missing: {missing.join(', ')}</div>}
        </div>

        <div className="mt-6">
          <ResultCard data={result} />
        </div>
      </div>
    </div>
  );
}

