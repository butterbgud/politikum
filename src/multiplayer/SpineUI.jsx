import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { CitadelGame as PolitikumGame } from './Game.js';

const SERVER = (import.meta.env.VITE_SERVER || window.localStorage.getItem('politikum.server') || window.location.origin);

const PERSONA_NAME = {
  'persona_1': 'Рунов',
  'persona_2': 'Сережко',
  'persona_3': 'SVTV',
  'persona_4': 'Яшин',
  'persona_5': 'Певчих',
  'persona_6': 'Кашин',
  'persona_7': 'Каспаров',
  'persona_8': 'Лазерсон',
  'persona_9': 'Пономарёв',
  'persona_10': 'Наки',
  'persona_11': 'Соловей',
  'persona_12': 'Савин',
  'persona_13': 'Венедитков',
  'persona_14': 'Ройзман',
  'persona_15': 'Пожарский',
  'persona_16': 'Кац',
  'persona_17': 'Арно',
  'persona_18': 'Соболь',
  'persona_19': 'Гиркин',
  'persona_20': 'Быков',
  'persona_21': 'Штефанов',
  'persona_22': 'Светов',
  'persona_23': 'Волков',
  'persona_24': 'Латынина',
  'persona_25': 'Надеждин',
  'persona_26': 'Демушкин',
  'persona_27': 'Юдин',
  'persona_28': 'Ведута',
  'persona_29': 'Юнеман',
  'persona_30': 'Ходорковский',
  'persona_31': 'Шлосберг',
  'persona_32': 'Плющев',
  'persona_33': 'Собчак',
  'persona_34': 'Милов',
  'persona_35': 'Жданов',
  'persona_36': 'Кагалицкий',
  'persona_37': 'Гуриев',
  'persona_38': 'VotVot',
  'persona_39': 'Лефт',
  'persona_40': 'Дунцова',
  'persona_41': 'Дождь',
  'persona_42': 'Стрелков',
  'persona_43': 'Доха',
  'persona_44': 'Рудой',
  'persona_45': 'Шульман',
};

function personaName(id) {
  const base = String(id || '').split('#')[0];
  return PERSONA_NAME[base] || base;
}

const lobbyClient = new LobbyClient({ server: SERVER });

const NAMES = [
  'Hakon', 'Rixa', 'Gisela', 'Dunstan', 'Irmgard', 'Cedric', 'Freya', 'Ulric', 'Yolanda', 'Tristan',
  'Beatrix', 'Lambert', 'Maude', 'Odilia', 'Viggo', 'Sibylla', 'Katarina', 'Norbert', 'Quintus',
];

function renderBasicMarkdown(md) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const out = [];
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc ml-5 space-y-1">
        {list.map((li, i) => <li key={i}>{li}</li>)}
      </ul>
    );
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      list.push(m[1]);
      continue;
    }
    flushList();
    if (/^\s*#\s+/.test(l)) {
      out.push(<div key={i} className="text-amber-50 font-black text-base">{l.replace(/^\s*#\s+/, '')}</div>);
    } else if (/^\s*##\s+/.test(l)) {
      out.push(<div key={i} className="text-amber-100/90 font-black text-sm">{l.replace(/^\s*##\s+/, '')}</div>);
    } else if (!String(l || '').trim()) {
      out.push(<div key={i} className="h-2" />);
    } else {
      out.push(<div key={i} className="whitespace-pre-wrap">{l}</div>);
    }
  }
  flushList();
  return out;
}

function NewsPanel() {
  const [md, setMd] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${SERVER}/public/news`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !json?.ok) throw new Error(`HTTP ${res.status}`);
        setMd(String(json.markdown || ''));
        setErr('');
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-amber-500/70 font-black">News</div>
        {/* server url hidden */}
      </div>
      {err && (
        <div className="mt-3 text-xs font-mono text-red-300">news error: {err}</div>
      )}
      <div className="mt-3 text-amber-100/80 font-serif text-sm space-y-2">
        {renderBasicMarkdown(md)}
      </div>
      {/* edit hint removed */}
    </div>
  );
}

function TournamentPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(true);
  const [lobbyChatErr, setLobbyChatErr] = useState('');
  const [lobbyChatInput, setLobbyChatInput] = useState('');

  const lobbyChatToken = (() => {
    try { return String(window.localStorage.getItem('politikum.authToken') || ''); } catch { return ''; }
  })();

  const [rightTab, setRightTab] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.welcomeRightTab') || 'games'); } catch {}
    return 'games';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);

  const [includeFinished, setIncludeFinished] = useState(false);


  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${SERVER}/public/tournaments?includeFinished=${includeFinished ? '1' : '0'}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [includeFinished]);

  return (
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      <div className="w-full max-w-4xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Турниры</div>
          </div>
          <button type="button" onClick={() => { window.location.hash = ''; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Exit</button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <label className="flex items-center gap-2 text-xs font-mono text-amber-200/60 select-none">
            <input type="checkbox" className="accent-amber-500" checked={includeFinished} onChange={(e) => { setIncludeFinished(e.target.checked); }} />
            <span>Show finished</span>
          </label>
          {err && <div className="text-xs font-mono text-red-300">Error: {err}</div>}
        </div>

        <div className="grid gap-3">
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { window.location.hash = `#/tournament/${t.id}`; }}
              className="text-left w-full bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3 hover:bg-black/50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-black text-amber-50">{t.name || t.id}</div>
                <div className="text-[10px] font-mono text-amber-200/60">{t.status}</div>
              </div>
              <div className="mt-1 text-xs font-mono text-amber-200/60">{t.type} · table {t.tableSize}</div>
            </button>
          ))}
          {(!items.length && !loading) && (
            <div className="text-xs font-mono text-amber-200/50">No tournaments yet. Ask an admin to create one.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TournamentDetailPage({ tournamentId }) {
  const [t, setT] = useState(null);
  const [tables, setTables] = useState([]);
  const [bracket, setBracket] = useState(null);
  const [err, setErr] = useState('');
  const [tablesErr, setTablesErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(true);
  const [lobbyChatErr, setLobbyChatErr] = useState('');
  const [lobbyChatInput, setLobbyChatInput] = useState('');

  const lobbyChatToken = (() => {
    try { return String(window.localStorage.getItem('politikum.authToken') || ''); } catch { return ''; }
  })();
  const viewerName = (() => {
    try { return String(window.localStorage.getItem('politikum.playerName') || '').trim().toLowerCase(); } catch { return ''; }
  })();

  const [rightTab, setRightTab] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.welcomeRightTab') || 'games'); } catch {}
    return 'top10';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);


  const hasAdminToken = (() => {
    try { return !!window.localStorage.getItem('politikum.adminToken'); } catch { return false; }
  })();

  const load = async () => {
    setLoading(true);
    setErr('');
    setTablesErr('');
    try {
      const res = await fetch(`${SERVER}/public/tournament/${tournamentId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setT(json.tournament || null);

      const res2 = await fetch(`${SERVER}/public/tournament/${tournamentId}/tables?round=1`);
      if (!res2.ok) {
        if (res2.status === 404) {
          setTables([]);
          setTablesErr('Round 1 not generated yet.');
        } else {
          throw new Error(`tables: HTTP ${res2.status}`);
        }
      } else {
        const json2 = await res2.json();
        setTables(json2.tables || []);
      }

      // Load full bracket (all rounds) for single_elim.
      const res3 = await fetch(`${SERVER}/public/tournament/${tournamentId}/bracket`);
      if (res3.ok) {
        const json3 = await res3.json();
        setBracket(json3.rounds || json3.bracket || null);
      } else if (res3.status === 404) {
        setBracket(null);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tournamentId]);

  const publicCreateTournamentMatch = async (tb) => {
    try {
      setLoading(true);
      setErr('');
      const pname = (() => { try { return String(window.localStorage.getItem('politikum.playerName') || ''); } catch { return ''; } })();
      const res = await fetch(`${SERVER}/public/tournament/${tournamentId}/table/${tb.id}/create_match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pname }) });
      if (!res.ok) {
        let details = '';
        try { details = await res.text(); } catch {}
        details = String(details || '').trim();
        throw new Error(`HTTP ${res.status}${details ? ` — ${details}` : ''}`);
      }
      const json = await res.json();
      await load();
      if (json?.matchId) openMatch(json.matchId);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const adminCreateMatch = async (tableId) => {
    setLoading(true);
    setErr('');
    try {
      const tok = String(window.localStorage.getItem('politikum.adminToken') || '');
      if (!tok) throw new Error('Admin token missing');
      const res = await fetch(`${SERVER}/admin/tournament/${tournamentId}/table/${tableId}/create_match`, {
        method: 'POST',
        headers: { 'X-Admin-Token': tok },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const openMatch = (matchId) => {
    try { window.localStorage.setItem('politikum.prejoinMatchId', String(matchId || '')); } catch {}
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      <div className="w-full max-w-4xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Tournament</div>
            {t && (
              <div className="mt-2 text-[10px] font-mono text-amber-200/60">({t.type} · table {t.tableSize} · {t.status})</div>
            )}
            <div className="text-amber-100/70 font-serif mt-1">{t?.name || tournamentId}</div>
          </div>
          <button type="button" onClick={() => { window.location.hash = '#/tournament'; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Back</button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button type="button" onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest">
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          <button type="button" disabled={loading} onClick={async () => {
            setLoading(true);
            setErr('');
            try {
              const tok = String(window.localStorage.getItem('politikum.authToken') || '');
              if (!tok) throw new Error('Not logged in (beta token missing)');
              let name = '';
              try { name = String(window.localStorage.getItem('politikum.playerName') || '').trim(); } catch {}
              const res = await fetch(`${SERVER}/public/tournament/${tournamentId}/join`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || null }),
              });
              if (!res.ok) {
                let details = '';
                try { details = await res.text(); } catch {}
                details = String(details || '').trim();
                throw new Error(`HTTP ${res.status}${details ? ` — ${details}` : ''}`);
              }
              await load();
            } catch (e) { setErr(e?.message || String(e)); }
            finally { setLoading(false); }
          }} className="px-4 py-2 rounded-xl bg-emerald-700/60 hover:bg-emerald-600/70 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest">Join</button>

          <button type="button" disabled={loading} onClick={async () => {
            setLoading(true);
            setErr('');
            try {
              const tok = String(window.localStorage.getItem('politikum.authToken') || '');
              if (!tok) throw new Error('Not logged in (beta token missing)');
              const res = await fetch(`${SERVER}/public/tournament/${tournamentId}/leave`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}` },
              });
              if (!res.ok) {
                let details = '';
                try { details = await res.text(); } catch {}
                details = String(details || '').trim();
                throw new Error(`HTTP ${res.status}${details ? ` — ${details}` : ''}`);
              }
              await load();
            } catch (e) { setErr(e?.message || String(e)); }
            finally { setLoading(false); }
          }} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-xs uppercase tracking-widest">Leave</button>

          {err && <div className="text-xs font-mono text-red-300">Error: {err}</div>}
        </div>

        {t && (
          <div className="grid gap-3">
                        {(!(Array.isArray(bracket) && bracket.length > 0)) && (
              <div className="bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3">
                <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Players</div>
                <div className="mt-2 grid gap-1 text-sm font-serif">
                  {(t.players || []).map((p) => (
                    <div key={p.playerId} className="text-amber-100/90">{p.name || p.playerId}</div>
                  ))}
                  {(!(t.players || []).length) && <div className="text-amber-200/40 italic">No players yet.</div>}
                </div>
              </div>
            )}

            {Array.isArray(bracket) && bracket.length > 0 && (
              <div className="bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3">
                <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black mb-2">Bracket (MVP)</div>
                <div className="overflow-x-auto">
                  <div className="flex gap-4 min-w-full">
                    {bracket.map((round) => (
                      <div key={round.id || round.roundIndex} className="min-w-[180px]">
                        <div className="text-[10px] uppercase tracking-widest text-amber-200/60 font-black mb-2">
                          Round {round.roundIndex}
                        </div>
                        <div className="grid gap-2">
                          {(round.tables || []).map((tb) => (
                            <div key={tb.id || tb.tableIndex} className="rounded-xl border border-amber-900/30 bg-black/40 px-3 py-2">
                              <div className="flex items-baseline justify-between gap-2 mb-1">
                                <div className="text-[10px] font-mono text-amber-200/70">Table {tb.tableIndex}</div>
                                <div className="flex items-center gap-2">
                                  <div className="text-[10px] font-mono text-amber-200/50">{tb.status || 'pending'}</div>
                                  {tb.matchId && (
                                    <>
                                      <button type="button" onClick={() => openMatch(tb.matchId)} className="text-[10px] font-mono text-amber-200/70 hover:text-amber-50">Open match</button>
                                      {(tb.seats || []).some((s) => String(s.name || s.playerId || '').trim().toLowerCase() === viewerName) && (
                                        <button type="button" onClick={() => openMatch(tb.matchId)} className="text-[10px] font-mono text-emerald-300/80 hover:text-emerald-200">Join</button>
                                      )}
                                    </>
                                  )}
                                  {(!tb.matchId && (tb.seats || []).some((s) => String(s.name || s.playerId || '').trim().toLowerCase() === viewerName)) && (
                                    <button type="button" disabled={loading} onClick={() => publicCreateTournamentMatch(tb)} className="text-[10px] font-mono text-emerald-300/80 hover:text-emerald-200 disabled:opacity-60">Create match</button>
                                  )}
                                </div>
                              </div>
                              <div className="grid gap-0.5 text-xs font-serif">
                                {(tb.seats || []).map((s) => (
                                  <div key={String(s.seat)} className="text-amber-100/90">
                                    {s.name || s.playerId}
                                  </div>
                                ))}
                                {tb.winnerPlayerId && (
                                  <div className="mt-1 text-[10px] font-mono text-emerald-300">
                                    Winner: {tb.result?.winnerName || tb.winnerPlayerId}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {!(round.tables || []).length && (
                            <div className="text-[10px] font-mono text-amber-200/40 italic">No tables.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function AdminTournamentPage() {
  const [token, setToken] = useState(() => {
    try { return window.localStorage.getItem('politikum.adminToken') || ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(true);
  const [lobbyChatErr, setLobbyChatErr] = useState('');
  const [lobbyChatInput, setLobbyChatInput] = useState('');

  const lobbyChatToken = (() => {
    try { return String(window.localStorage.getItem('politikum.authToken') || ''); } catch { return ''; }
  })();
  const viewerName = (() => {
    try { return String(window.localStorage.getItem('politikum.playerName') || '').trim().toLowerCase(); } catch { return ''; }
  })();

  const [rightTab, setRightTab] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.welcomeRightTab') || 'games'); } catch {}
    return 'top10';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);

  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [includeFinished, setIncludeFinished] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('single_elim');
  const [tableSize, setTableSize] = useState(4);
  const [maxPlayers, setMaxPlayers] = useState('');

  const saveToken = (value) => {
    setToken(value);
    try { window.localStorage.setItem('politikum.adminToken', value); } catch {}
  };

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/public/tournaments?includeFinished=${includeFinished ? '1' : '0'}`);
      if (!res.ok) throw new Error(`list: HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [includeFinished]);

  const adminPost = async (path, body = null) => {
    if (!token) throw new Error('Set X-Admin-Token first.');

    const headers = { 'X-Admin-Token': token };
    const opts = { method: 'POST', headers };

    if (body !== null && body !== undefined) {
      opts.headers = { ...headers, 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${SERVER}${path}`, opts);
    if (!res.ok) {
      let details = '';
      try { details = await res.text(); } catch {}
      details = String(details || '').trim();
      throw new Error(`${path}: HTTP ${res.status}${details ? ` — ${details}` : ''}`);
    }

    // Some admin endpoints may intentionally return 204 No Content.
    if (res.status === 204) return null;

    const ct = String(res.headers.get('content-type') || '');
    if (ct.includes('application/json')) return await res.json();

    const text = await res.text();
    return text ? { ok: true, text } : null;
  };

  const create = async () => {
    setLoading(true);
    setError('');
    try {
      const mp = String(maxPlayers || '').trim();
      await adminPost('/admin/tournament/create', {
        name: String(name || '').trim(),
        type,
        tableSize: Number(tableSize) || 2,
        maxPlayers: mp ? (Number(mp) || null) : null,
      });
      setName('');
      setMaxPlayers('');
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (id, action) => {
    setLoading(true);
    setError('');
    try {
      await adminPost(`/admin/tournament/${id}/${action}`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const generateRound1 = async (id) => {
    setLoading(true);
    setError('');
    try {
      // Backend endpoint doesn't require a JSON body; keep this as a plain POST.
      await adminPost(`/admin/tournament/${id}/generate_round1`, null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  return (
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      <div className="w-full max-w-5xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Admin / tournaments (v1)</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { window.location.hash = '#/admin'; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Stats</button>
            <button type="button" disabled className="text-xs font-mono text-amber-50/90 font-black">Турниры</button>
            <button type="button" onClick={() => { window.location.hash = ''; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Exit</button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-widest text-amber-400 font-black block mb-1">X-Admin-Token</label>
            <input type="password" value={token} onChange={(e) => saveToken(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" placeholder="Paste shared secret" />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest">{loading ? 'Loading…' : 'Refresh'}</button>
            <label className="flex items-center gap-2 text-xs font-mono text-amber-200/70">
              <input type="checkbox" checked={includeFinished} onChange={(e) => setIncludeFinished(e.target.checked)} />
              include finished
            </label>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-xs font-mono text-red-300 bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2">Error: {error}</div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-black/40 border border-amber-900/20 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Create tournament</div>
            <div className="mt-3 grid gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" />
              <div className="grid grid-cols-3 gap-2">
                <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono">
                  <option value="single_elim">Single elimination</option>
                  <option value="double_elim">Double elimination</option>
                </select>
                <input value={String(tableSize)} onChange={(e) => setTableSize(e.target.value)} placeholder="tableSize" className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" />
                <input value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} placeholder="maxPlayers" className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" />
              </div>
              <button type="button" onClick={create} disabled={loading} className="px-3 py-2 rounded bg-emerald-700/80 hover:bg-emerald-600/90 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest">Create</button>
            </div>
          </div>

          <div className="bg-black/40 border border-amber-900/20 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Notes</div>
            <div className="mt-2 text-xs font-mono text-amber-100/70 leading-relaxed">v1: create/open/close/cancel + join/leave on public page. No brackets yet.</div>
          </div>
        </div>

        <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Турниры</div>
        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-left text-xs font-mono text-amber-100/90">
            <thead>
              <tr className="border-b border-amber-900/40">
                <th className="px-2 py-2 whitespace-nowrap">Created</th>
                <th className="px-2 py-2 whitespace-nowrap">Name</th>
                <th className="px-2 py-2 whitespace-nowrap">Status</th>
                <th className="px-2 py-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-amber-900/20">
                  <td className="px-2 py-2 align-top whitespace-nowrap">{fmt(t.createdAt)}</td>
                  <td className="px-2 py-2 align-top">
                    <div className="font-black">{t.name}</div>
                    <div className="text-[10px] text-amber-200/40">{t.id} · table {t.tableSize} · players {(t.playersCount ?? t.playerCount ?? '?')}/{Math.max(2, Number(t.tableSize)||2)}</div>
                    <a href={`#/tournament/${t.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] uppercase tracking-widest text-amber-200/70 hover:text-amber-50 font-black">Open public page</a>
                  </td>
                  <td className="px-2 py-2 align-top whitespace-nowrap">{t.status}</td>
                  <td className="px-2 py-2 align-top whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={loading} onClick={() => setStatus(t.id, 'open_registration')} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-[10px] uppercase tracking-widest">Open reg</button>
                      <button type="button" disabled={loading} onClick={() => setStatus(t.id, 'close_registration')} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-[10px] uppercase tracking-widest">Close reg</button>
                      <button type="button" disabled={loading} onClick={() => generateRound1(t.id)} className="px-2 py-1 rounded-lg bg-amber-700/70 hover:bg-amber-600/80 disabled:opacity-60 text-amber-50 font-black text-[10px] uppercase tracking-widest">Generate R1</button>
                      {t.status === 'running' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={async () => {
                            setLoading(true);
                            setError('');
                            try {
                              await adminPost(`/admin/tournament/${t.id}/generate_next_round`, null);
                              await load();
                            } catch (e) {
                              setError(e?.message || String(e));
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="px-2 py-1 rounded-lg bg-amber-700/70 hover:bg-amber-600/80 disabled:opacity-60 text-amber-50 font-black text-[10px] uppercase tracking-widest"
                        >
                          Next round
                        </button>
                      )}
                      <button type="button" disabled={loading} onClick={() => setStatus(t.id, 'cancel')} className="px-2 py-1 rounded-lg bg-red-900/60 hover:bg-red-900/80 disabled:opacity-60 text-red-100 font-black text-[10px] uppercase tracking-widest">Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-2 py-6 text-center text-amber-300/60 text-xs">No tournaments yet. Ask an admin to create one.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminMobileGamesPage() {
  const [token, setToken] = useState(() => {
    try { return window.localStorage.getItem('politikum.adminToken') || ''; } catch { return ''; }
  });
  const [tokenDraft, setTokenDraft] = useState(() => {
    try { return window.localStorage.getItem('politikum.adminToken') || ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authed, setAuthed] = useState(false);
  const [games, setGames] = useState([]);
  const [gamesWindow, setGamesWindow] = useState('day');
  const [liveMatches, setLiveMatches] = useState([]);
  const [liveTotal, setLiveTotal] = useState(null);

  const [matchLogId, setMatchLogId] = useState('');
  const [matchLogJson, setMatchLogJson] = useState('');

  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profile, setProfile] = useState(null);

  const openProfileById = async (pid, expectedName = '') => {
    const id = String(pid || '').trim();
    if (!id) return;

    // If profile doesn't exist, do nothing (no modal).
    setProfileLoading(true);
    setProfileErr('');
    setProfile(null);

    const fetchProfile = async (playerId) => {
      const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(String(playerId))}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.ok) return null;
      return json;
    };

    try {
      let json = await fetchProfile(id);
      if (!json) return;

      const exp = String(expectedName || '').trim().toLowerCase();
      const got = String(json?.name || json?.playerName || '').trim().toLowerCase();

      // Rare: game_players mapping can be wrong (name->playerId). Fallback resolve by name.
      if (exp && got && exp !== got) {
        try {
          const lb = await fetch(`${SERVER}/public/leaderboard?limit=200`, { cache: 'no-store' });
          if (lb.ok) {
            const lbJson = await lb.json();
            const items = Array.isArray(lbJson?.items) ? lbJson.items : [];
            const hit = items.find((r) => String(r?.name || '').trim().toLowerCase() === exp);
            const alt = String(hit?.playerId || '').trim();
            if (alt && alt !== id) {
              const json2 = await fetchProfile(alt);
              if (json2) json = json2;
            }
          }
        } catch {}
      }

      // Open modal only on success.
      setProfile(json);
      setShowProfile(true);
    } finally {
      setProfileLoading(false);
    }
  };

  const applyToken = (value) => {
    const v = String(value || '').trim();
    setToken(v);
    try { window.localStorage.setItem('politikum.adminToken', v); } catch {}
    // Clear cached results when token changes.
    try { setAuthed(false); } catch {}
    try { setGames([]); } catch {}
    try { setMatchLogJson(''); } catch {}
    try { setError(''); } catch {}
  };

  const formatTimeShortDay = (ms) => {
    try {
      if (!ms) return '';
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    } catch { return ''; }
  };
  const formatTimeOnly = (ms) => {
    try {
      if (!ms) return '';
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mi}`;
    } catch { return ''; }
  };
  const isToday = (ms) => {
    try {
      if (!ms) return false;
      const d = new Date(ms);
      const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    } catch { return false; }
  };

  const formatTime = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '—';
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '<1 min';
    return `${minutes} min`;
  };

  const filteredGames = (games || []).filter((g) => {
    const t = Number(g?.finishedAt || g?.createdAt || 0);
    if (!t) return true;
    const now = Date.now();
    if (gamesWindow === 'hour') return (now - t) <= 3600_000;
    if (gamesWindow === 'day') return (now - t) <= 24 * 3600_000;
    if (gamesWindow === 'week') return (now - t) <= 7 * 24 * 3600_000;
    return true;
  });

  const fetchGames = async () => {
    if (!token) { setAuthed(false); setError('Set X-Admin-Token first.'); return; }
    setLoading(true);
    setError('');
    try {
      const [gamesRes, matchesRes] = await Promise.all([
        fetch(`${SERVER}/admin/games?limit=60&offset=0`, { headers: { 'X-Admin-Token': token } }),
        fetch(`${SERVER}/admin/matches?limit=30`, { headers: { 'X-Admin-Token': token } }),
      ]);
      if (!gamesRes.ok) throw new Error(`games: HTTP ${gamesRes.status}`);
      if (!matchesRes.ok) throw new Error(`matches: HTTP ${matchesRes.status}`);
      const gamesJson = await gamesRes.json();
      const matchesJson = await matchesRes.json();
      setGames(gamesJson.items || []);
      setLiveMatches(matchesJson.items || []);
      setLiveTotal(matchesJson.total ?? null);
      setAuthed(true);
    } catch (e) {
      setAuthed(false);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyText = (txt) => {
    const s = String(txt ?? '');
    try {
      const fn = navigator.clipboard?.writeText;
      if (fn) { fn.call(navigator.clipboard, s); return; }
    } catch {}
    try { window.prompt('Copy to clipboard:', s); } catch {}
  };

  const fetchMatchLog = async () => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    const mid = String(matchLogId || '').trim();
    if (!mid) { setError('Set Match ID.'); return; }
    setLoading(true);
    setError('');
    setMatchLogJson('');
    try {
      const res = await fetch(`${SERVER}/admin/match/${encodeURIComponent(mid)}/log?limit=200`, { headers: { 'X-Admin-Token': token } });
      if (!res.ok) throw new Error(`match log: HTTP ${res.status}`);
      const json = await res.json();
      setMatchLogJson(JSON.stringify(json, null, 2));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const killMatch = async (matchId) => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    const mid = String(matchId || '').trim();
    if (!mid) return;
    if (!confirm(`Kill match ${mid}?`)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/admin/match/${encodeURIComponent(mid)}/kill`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
      });
      if (!res.ok) throw new Error(`kill: HTTP ${res.status}`);
      await fetchGames();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // No auto-refresh on every keystroke; user taps Refresh explicitly.

  return (
    <div className="min-h-screen w-screen overflow-x-hidden text-amber-50 flex items-start justify-center p-3 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      {showProfile && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(520px,92vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Профиль</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">Доступен всем</div>
              </div>
              <button type="button" onClick={() => setShowProfile(false)} className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest">Закрыть</button>
            </div>

            {profileLoading && (
              <div className="mt-4 text-amber-200/80 font-mono text-[12px]">loading…</div>
            )}
            {!profileLoading && profileErr && (
              <div className="mt-4 text-red-200/90 font-mono text-[12px]">{profileErr}</div>
            )}
            {!profileLoading && !profileErr && profile?.ok && (
              <div className="mt-4 text-amber-100/90 font-mono text-[12px] space-y-2">
                <div><span className="opacity-60">Name:</span> {profile.name || profile.playerName || profile.playerId}</div>
                <div><span className="opacity-60">Рейтинг:</span> {profile.rating ?? '—'}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Games</div><div className="font-black">{profile.games ?? '—'}</div></div>
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Wins</div><div className="font-black">{profile.wins ?? '—'}</div></div>
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Win%</div><div className="font-black">{profile.winRate != null ? `${Math.round(Number(profile.winRate) * 100)}%` : '—'}</div></div>
                </div>
                {(profile.bioText || '').trim() && (
                  <div className="mt-2 whitespace-pre-wrap text-amber-100/80">{String(profile.bioText)}</div>
                )}
                {!!profile.playerId && (
                  <a className="inline-block mt-2 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[11px]" href={`#/`} onClick={(e) => { e.preventDefault(); window.open(`/profile/${encodeURIComponent(String(profile.playerId))}`, '_blank'); }}>
                    Открыть публичный профиль
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-xl bg-slate-950/85 border border-amber-900/40 rounded-3xl p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em] text-xs">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1 text-sm">Admin (mobile) · Games</div>
          </div>
          <button type="button" className="px-3 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-amber-900/25 text-amber-50 font-black text-[11px]" onClick={() => { window.location.hash = '#/admin'; }}>
            Full admin
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          <label className="text-[10px] uppercase tracking-widest text-amber-400 font-black">X-Admin-Token</label>
          <div className="flex items-center gap-2">
            <input type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" placeholder="Paste shared secret" />
            <button type="button" onClick={() => { applyToken(tokenDraft); setTimeout(() => { try { fetchGames(); } catch {} }, 0); }} disabled={loading} className="px-4 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-amber-900/25 text-amber-50 font-black text-xs uppercase tracking-widest">Use</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={fetchGames} disabled={loading || !token} className="flex-1 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest">{loading ? 'Loading…' : 'Refresh'}</button>
            <select value={gamesWindow} onChange={(e) => setGamesWindow(e.target.value)} className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-xs font-mono">
              <option value="hour">hour</option>
              <option value="day">today</option>
              <option value="week">week</option>
              <option value="all">all</option>
            </select>
          </div>
        </div>

        {!!error && (
          <div className="mt-3 text-xs font-mono text-red-300 bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2">Error: {error}</div>
        )}

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Live matches</div>
          {!authed && (
            <div className="text-amber-200/60 text-xs font-mono">Enter token and tap Use (then Refresh).</div>
          )}
          {!!authed && (
            <div className="grid gap-2">
              {(liveMatches || []).map((m) => (
                <div key={m.matchId} className="bg-black/40 border border-amber-900/20 rounded-2xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-amber-100/90 font-mono font-black text-xs break-all">{String(m.matchId || '')}</div>
                      <div className="mt-1 text-amber-100/65 text-[11px] font-mono">upd {formatTime(m.updatedAt)} · players {(m.players || []).length}{(liveTotal != null ? ` / total ${liveTotal}` : '')}</div>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <button type="button" className="px-3 py-2 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[11px]" onClick={() => copyText(m.matchId)}>Copy</button>
                      <button type="button" className="px-3 py-2 rounded-xl bg-red-900/60 hover:bg-red-900/80 border border-red-900/30 text-red-100 font-black text-[11px]" onClick={() => killMatch(m.matchId)}>Kill</button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(m.players || []).map((p, i) => (
                      <span key={i} className="px-2 py-1 rounded-full border text-[11px] font-mono font-black bg-black/25 border-amber-900/25 text-amber-100/85">
                        {String(p?.name || p?.playerId || '')}
                      </span>
                    ))}
                    {!(m.players || []).length && (
                      <span className="text-amber-200/60 text-xs font-mono">(no active players)</span>
                    )}
                  </div>
                </div>
              ))}
              {!(liveMatches || []).length && (
                <div className="text-amber-200/60 text-xs font-mono">No live matches.</div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Last games</div>
          {!authed && (
            <div className="text-amber-200/60 text-xs font-mono">Enter token and tap Use (then Refresh).</div>
          )}
          {!!authed && (
          <div className="grid gap-2">
            {filteredGames.map((g) => (
              <div key={g.matchId} className="bg-black/40 border border-amber-900/20 rounded-2xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-amber-100/90 font-mono font-black text-xs break-all">{String(g.matchId || '')}</div>
                    <div className="mt-1 text-amber-100/65 text-[11px] font-mono">{gamesWindow === 'day' ? formatTimeOnly(g.finishedAt || g.createdAt) : formatTime(g.finishedAt || g.createdAt)} · {formatDuration(g.durationMs || ((g.finishedAt || 0) - (g.createdAt || 0)))}</div>
                  </div>
                  <button type="button" className="shrink-0 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[11px]" onClick={() => copyText(g.matchId)}>Copy</button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(g.players || []).map((p) => {
                    const isWin = String(p?.name || '') && String(p?.name || '') === String(g.winnerName || '');
                    const label = String(p?.name || p?.playerId || '').trim();
                    const canOpen = !!String(p?.playerId || '').trim();
                    return (
                      <button
                        key={String(p?.playerId || p?.name || Math.random())}
                        type="button"
                        disabled={!canOpen}
                        onClick={() => { if (canOpen) openProfileById(p.playerId, p.name); }}
                        className={
                          "px-2 py-1 rounded-full border text-[11px] font-mono font-black " +
                          (isWin
                            ? "bg-emerald-700/25 border-emerald-400/40 text-emerald-100"
                            : "bg-black/25 border-amber-900/25 text-amber-100/85") +
                          (!canOpen ? " opacity-70" : " hover:bg-black/35")
                        }
                        title={canOpen ? 'Open profile' : ''}
                      >
                        {label}{isWin ? ' ★' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredGames.length === 0 && (
              <div className="text-amber-200/60 text-xs font-mono">No games in this window.</div>
            )}
          </div>
          )}
        </div>

        {!!authed && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Lobby chat</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/disable`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`disable: HTTP ${res.status}`);
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-red-900/60 hover:bg-red-900/80 disabled:opacity-60 text-red-100 font-black text-xs uppercase tracking-widest"
              >
                OFF
              </button>
              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/enable`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`enable: HTTP ${res.status}`);
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-emerald-700/70 hover:bg-emerald-600/80 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest"
              >
                ON
              </button>
              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  if (!confirm('Clear all lobby chat messages?')) return;
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/clear`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`clear: HTTP ${res.status}`);
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="px-4 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-amber-900/25 text-amber-50 font-black text-xs uppercase tracking-widest"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {!!authed && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Fetch log</div>
            <div className="grid gap-2">
              <input value={matchLogId} onChange={(e) => setMatchLogId(e.target.value)} placeholder="Match ID" className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={fetchMatchLog} disabled={loading || !token} className="flex-1 px-4 py-2 rounded-xl bg-emerald-700/80 hover:bg-emerald-600/90 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest">Fetch</button>
                {!!matchLogJson && (
                  <>
                    <button type="button" onClick={() => copyText(matchLogJson)} className="px-4 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-amber-900/25 text-amber-50 font-black text-xs uppercase tracking-widest">Copy</button>
                    <button type="button" onClick={() => setMatchLogJson('')} className="px-4 py-2 rounded-xl bg-black/30 hover:bg-black/45 border border-amber-900/20 text-amber-100/80 font-black text-xs uppercase tracking-widest">Hide</button>
                  </>
                )}
              </div>
              {!!matchLogJson && (
                <textarea readOnly value={matchLogJson} className="w-full min-h-[220px] px-3 py-2 rounded-2xl bg-black/60 border border-amber-900/30 text-amber-50/90 text-[11px] font-mono" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeOnly(ms) {
  try {
    if (!ms) return '';
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  } catch { return ''; }
}

function AdminPage() {
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem('politikum.adminToken') || '';
    } catch {
      return '';
    }
  });
  const [summary, setSummary] = useState(null);
  const [games, setGames] = useState([]);
  const [gamesOffset, setGamesOffset] = useState(0);
  const [gamesHasMore, setGamesHasMore] = useState(false);
  const [gamesTotalFinished, setGamesTotalFinished] = useState(null);
  const [liveMatches, setLiveMatches] = useState([]);
  const [liveTotal, setLiveTotal] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(true);
  const [lobbyChatErr, setLobbyChatErr] = useState('');
  const [lobbyChatInput, setLobbyChatInput] = useState('');

  const lobbyChatToken = (() => {
    try { return String(window.localStorage.getItem('politikum.authToken') || ''); } catch { return ''; }
  })();
  const viewerName = (() => {
    try { return String(window.localStorage.getItem('politikum.playerName') || '').trim().toLowerCase(); } catch { return ''; }
  })();

  const [rightTab, setRightTab] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.welcomeRightTab') || 'games'); } catch {}
    return 'top10';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);

  const [error, setError] = useState('');
  const [matchLogId, setMatchLogId] = useState('');
  const [matchLogJson, setMatchLogJson] = useState('');

  const [bugTgChatId, setBugTgChatId] = useState(() => {
    try { return window.localStorage.getItem('politikum.bugTgChatId') || ''; } catch { return ''; }
  });
  const [bugTgToken, setBugTgToken] = useState('');
  const [bugTgStatus, setBugTgStatus] = useState('');

  const [gamesWindow, setGamesWindow] = useState('day'); // hour|day|week|all

  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profile, setProfile] = useState(null);

  const openProfileById = async (pid, expectedName = '') => {
    const id = String(pid || '').trim();
    if (!id) return;

    const fetchProfile = async (playerId) => {
      const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(String(playerId))}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.ok) return null;
      return json;
    };

    setProfileLoading(true);
    setProfileErr('');
    setProfile(null);

    try {
      let json = await fetchProfile(id);
      if (!json) return;

      const exp = String(expectedName || '').trim().toLowerCase();
      const got = String(json?.name || json?.playerName || '').trim().toLowerCase();

      if (exp && got && exp !== got) {
        let resolved = false;
        try {
          const lb = await fetch(`${SERVER}/public/leaderboard?limit=200`, { cache: 'no-store' });
          if (lb.ok) {
            const lbJson = await lb.json();
            const items = Array.isArray(lbJson?.items) ? lbJson.items : [];
            const hit = items.find((r) => String(r?.name || '').trim().toLowerCase() === exp);
            const alt = String(hit?.playerId || '').trim();
            if (alt) {
              const json2 = await fetchProfile(alt);
              if (json2) { json = json2; resolved = true; }
            }
          }
        } catch {}
        if (!resolved) return;
      }

      setProfile(json);
      setShowProfile(true);
    } finally {
      setProfileLoading(false);
    }
  };

  const filteredGames = (games || []).filter((g) => {
    const t = Number(g?.finishedAt || g?.createdAt || 0);
    if (!t) return true;
    const now = Date.now();
    if (gamesWindow === 'hour') return (now - t) <= 3600_000;
    if (gamesWindow === 'day') return (now - t) <= 24 * 3600_000;
    if (gamesWindow === 'week') return (now - t) <= 7 * 24 * 3600_000;
    return true;
  });

  const saveToken = (value) => {
    setToken(value);
    try {
      window.localStorage.setItem('politikum.adminToken', value);
    } catch {}
  };

  const copyAdminText = (txt) => {
    const s = String(txt ?? '');
    try {
      const fn = navigator.clipboard?.writeText;
      if (fn) { fn.call(navigator.clipboard, s); return true; }
    } catch {}
    try { window.prompt('Copy to clipboard:', s); return false; } catch {}
    return false;
  };

  useEffect(() => {
    if (!token) return;
    fetchAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchAdmin = async (opts = {}) => {
    if (!token) {
      setError('Set X-Admin-Token first.');
      return;
    }
    const loadMore = !!opts.loadMore;
    const limitGames = 20;
    const offset = loadMore ? Number(gamesOffset || 0) : 0;

    setLoading(true);
    setError('');
    try {
      const headers = { 'X-Admin-Token': token };
      const [summaryRes, gamesRes, matchesRes, lbRes] = await Promise.all([
        fetch(`${SERVER}/admin/summary`, { headers }),
        fetch(`${SERVER}/admin/games?limit=${limitGames}&offset=${offset}`, { headers }),
        fetch(`${SERVER}/admin/matches?limit=20`, { headers }),
        fetch(`${SERVER}/admin/leaderboard?limit=20`, { headers }),
      ]);
      if (!summaryRes.ok) throw new Error(`summary: HTTP ${summaryRes.status}`);
      if (!gamesRes.ok) throw new Error(`games: HTTP ${gamesRes.status}`);
      if (!matchesRes.ok) throw new Error(`matches: HTTP ${matchesRes.status}`);
      if (!lbRes.ok) throw new Error(`leaderboard: HTTP ${lbRes.status}`);
      const summaryJson = await summaryRes.json();
      const gamesJson = await gamesRes.json();
      const matchesJson = await matchesRes.json();
      const lbJson = await lbRes.json();
      setSummary(summaryJson);
      setGamesTotalFinished(summaryJson?.gamesFinished ?? null);

      const newItems = gamesJson.items || [];
      if (loadMore) setGames((prev) => [...prev, ...newItems]);
      else setGames(newItems);

      const nextOffset = offset + newItems.length;
      setGamesOffset(nextOffset);

      const totalFinished = Number(summaryJson?.gamesFinished ?? NaN);
      if (Number.isFinite(totalFinished)) setGamesHasMore(nextOffset < totalFinished);
      else setGamesHasMore(newItems.length >= limitGames);

      setLiveMatches(matchesJson.items || []);
      setLiveTotal(matchesJson.total ?? null);
      setLeaderboard(lbJson.items || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const forceSync = async () => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/admin/sync`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
      });
      if (!res.ok) throw new Error(`sync: HTTP ${res.status}`);
      // after sync, refresh all tables
      await fetchAdmin();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const killMatch = async (matchId) => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    const mid = String(matchId || '').trim();
    if (!mid) return;
    if (!confirm(`Kill match ${mid}? This deletes it from server storage.`)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/admin/match/${encodeURIComponent(mid)}/kill`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
      });
      if (!res.ok) throw new Error(`kill: HTTP ${res.status}`);
      await fetchAdmin();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchMatchLog = async () => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    const mid = String(matchLogId || '').trim();
    if (!mid) { setError('Set Match ID.'); return; }
    setLoading(true);
    setError('');
    setMatchLogJson('');
    try {
      const res = await fetch(`${SERVER}/admin/match/${encodeURIComponent(mid)}/log?limit=200`, {
        headers: { 'X-Admin-Token': token },
      });
      if (!res.ok) throw new Error(`match log: HTTP ${res.status}`);
      const json = await res.json();
      setMatchLogJson(JSON.stringify(json, null, 2));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const formatTimeShortDay = (ms) => {
    try {
      if (!ms) return '';
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    } catch { return ''; }
  };

  const formatTime = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '—';
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '<1 min';
    return `${minutes} min`;
  };

  return (
    <div className="min-h-screen w-screen overflow-x-hidden text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      {showProfile && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(520px,92vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Профиль</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">Доступен всем</div>
              </div>
              <button type="button" onClick={() => setShowProfile(false)} className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest">Закрыть</button>
            </div>

            {profileLoading && (
              <div className="mt-4 text-amber-200/80 font-mono text-[12px]">loading…</div>
            )}
            {!profileLoading && profileErr && (
              <div className="mt-4 text-red-200/90 font-mono text-[12px]">{profileErr}</div>
            )}
            {!profileLoading && !profileErr && profile?.ok && (
              <div className="mt-4 text-amber-100/90 font-mono text-[12px] space-y-2">
                <div><span className="opacity-60">Name:</span> {profile.name || profile.playerName || profile.playerId}</div>
                <div><span className="opacity-60">Рейтинг:</span> {profile.rating ?? '—'}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Games</div><div className="font-black">{profile.games ?? '—'}</div></div>
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Wins</div><div className="font-black">{profile.wins ?? '—'}</div></div>
                  <div className="bg-black/30 border border-amber-900/20 rounded-xl p-2"><div className="opacity-60 text-[10px]">Win%</div><div className="font-black">{profile.winRate != null ? `${Math.round(Number(profile.winRate) * 100)}%` : '—'}</div></div>
                </div>
                {(profile.bioText || '').trim() && (
                  <div className="mt-2 whitespace-pre-wrap text-amber-100/80">{String(profile.bioText)}</div>
                )}
                {!!profile.playerId && (
                  <a className="inline-block mt-2 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[11px]" href={`#/`} onClick={(e) => { e.preventDefault(); window.open(`/profile/${encodeURIComponent(String(profile.playerId))}`, '_blank'); }}>
                    Открыть публичный профиль
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Admin / stats (MVP)</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                value={matchLogId}
                onChange={(e) => setMatchLogId(e.target.value)}
                placeholder="Match ID"
                className="px-3 py-2 rounded-xl bg-black/40 border border-amber-900/30 text-amber-50/90 font-mono text-xs w-[190px]"
              />
              <button
                type="button"
                disabled={loading || !token}
                onClick={fetchMatchLog}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-[10px] uppercase tracking-widest"
                title="Fetch /admin/match/:id/log"
              >
                Fetch log
              </button>

              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  if (!token) { setError('Set X-Admin-Token first.'); return; }
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/disable`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`disable: HTTP ${res.status}`);
                    await fetchAdmin();
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="px-3 py-2 rounded-xl bg-red-900/60 hover:bg-red-900/80 disabled:opacity-60 text-red-100 font-black text-[10px] uppercase tracking-widest"
                title="Disable lobby chat"
              >
                Chat OFF
              </button>
              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  if (!token) { setError('Set X-Admin-Token first.'); return; }
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/enable`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`enable: HTTP ${res.status}`);
                    await fetchAdmin();
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="px-3 py-2 rounded-xl bg-emerald-700/70 hover:bg-emerald-600/80 disabled:opacity-60 text-emerald-50 font-black text-[10px] uppercase tracking-widest"
                title="Enable lobby chat"
              >
                Chat ON
              </button>
              <button
                type="button"
                disabled={loading || !token}
                onClick={async () => {
                  if (!token) { setError('Set X-Admin-Token first.'); return; }
                  if (!confirm('Clear all lobby chat messages?')) return;
                  setLoading(true); setError('');
                  try {
                    const res = await fetch(`${SERVER}/admin/lobby_chat/clear`, { method: 'POST', headers: { 'X-Admin-Token': token } });
                    if (!res.ok) throw new Error(`clear: HTTP ${res.status}`);
                    await fetchAdmin();
                  } catch (e) { setError(e?.message || String(e)); } finally { setLoading(false); }
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-[10px] uppercase tracking-widest"
                title="Clear lobby chat"
              >
                Clear
              </button>

              {/* Copy moved into the match log panel */}
            </div>

            <button
              type="button"
              onClick={() => { window.location.hash = '#/admin/tournament'; }}
              className="text-xs font-mono text-amber-200/60 hover:text-amber-50"
            >
              Tournaments
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = '#/admin/bugreports'; }}
              className="text-xs font-mono text-amber-200/60 hover:text-amber-50"
            >
              Bugreports
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = ''; }}
              className="text-xs font-mono text-amber-200/60 hover:text-amber-50"
            >
              Exit
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-widest text-amber-400 font-black block mb-1">
              X-Admin-Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => saveToken(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono"
              placeholder="Paste shared secret"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={fetchAdmin}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={forceSync}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-amber-100 font-black text-xs uppercase tracking-widest"
              title="Force rescan finished matches and write to SQLite"
            >
              Sync
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-xs font-mono text-red-300 bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2">
            Error: {error}
          </div>
        )}

        {!!matchLogJson && (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-black">Match log JSON</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-[10px] font-mono font-black text-amber-200/70 hover:text-amber-50 underline underline-offset-4"
                  onClick={() => {
                    const s = String(matchLogJson || '');
                    try {
                      const fn = navigator.clipboard?.writeText;
                      if (fn) { fn.call(navigator.clipboard, s); return; }
                    } catch {}
                    try { window.prompt('Copy match log JSON:', s); } catch {}
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="text-[10px] font-mono font-black text-amber-200/70 hover:text-amber-50 underline underline-offset-4"
                  onClick={() => setMatchLogJson('')}
                >
                  Hide
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={matchLogJson}
              className="w-full h-[240px] px-3 py-2 rounded-2xl bg-black/50 border border-amber-900/30 text-amber-50/90 font-mono text-[11px]"
            />
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
            <div className="bg-black/50 border border-amber-900/40 rounded-2xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-black mb-1">Total games</div>
              <div className="text-xl font-mono font-bold text-amber-50">{summary.gamesTotal}</div>
            </div>
            <div className="bg-black/50 border border-amber-900/40 rounded-2xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald-300/70 font-black mb-1">Finished</div>
              <div className="text-xl font-mono font-bold text-emerald-300">{summary.gamesFinished}</div>
            </div>
            <div className="bg-black/50 border border-amber-900/40 rounded-2xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-black mb-1">In progress</div>
              <div className="text-xl font-mono font-bold text-amber-300">{summary.liveInProgressTotal ?? summary.gamesInProgress}</div>
            </div>
            <div className="bg-black/50 border border-amber-900/40 rounded-2xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-black mb-1">Last finished</div>
              <div className="text-[11px] font-mono text-amber-100/80 leading-tight">
                {summary.lastFinishedAt ? formatTime(summary.lastFinishedAt) : '—'}
              </div>
              <div className="mt-1 text-[10px] font-mono text-amber-200/40">
                sync: {summary.lastAdminSyncAt ? formatTime(summary.lastAdminSyncAt) : '—'}
              </div>
            </div>
          </div>
        )}

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowLeaderboard((v) => !v)}
            className="w-full flex items-baseline justify-between mb-2 text-left"
          >
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black">Leaderboard (MVP)</div>
            <div className="text-[11px] font-mono text-amber-200/60">{showLeaderboard ? 'Hide' : 'Show'}</div>
          </button>
          {showLeaderboard && (
          <div className="overflow-x-auto -mx-2 mb-6">
            <table className="min-w-full text-left text-xs font-mono text-amber-100/90">
              <thead>
                <tr className="border-b border-amber-900/40">
                  <th className="px-2 py-2 whitespace-nowrap">Player</th>
                  <th className="px-2 py-2 whitespace-nowrap">Рейтинг</th>
                  <th className="px-2 py-2 whitespace-nowrap">Wins</th>
                  <th className="px-2 py-2 whitespace-nowrap">Игры</th>
                  <th className="px-2 py-2 whitespace-nowrap">Last win</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => {
                  const canOpen = !!String(r?.playerId || '').trim();
                  return (
                  <tr key={i} className="border-b border-amber-900/20">
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!canOpen}
                        onClick={() => { if (canOpen) openProfileById(r.playerId, r.name); }}
                        className={(canOpen ? 'underline underline-offset-4 hover:text-amber-50 ' : '') + 'text-amber-100/90 font-black'}
                        title={canOpen ? 'Open profile' : ''}
                      >
                        {r.name || '(anon)'}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap text-amber-100/90 font-black tabular-nums">{Number(r.rating ?? 0) || 0}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap text-emerald-300 font-black tabular-nums">{r.wins}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap tabular-nums">{r.games}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{r.lastFinishedAt ? formatTimeShortDay(r.lastFinishedAt) : '—'}</td>
                  </tr>
                );
                })}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-2 py-4 text-center text-amber-300/60 text-xs">
                      No finished games recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black">Live matches</div>
            <div className="text-[11px] font-mono text-amber-200/60">{liveTotal == null ? '' : `total ${liveTotal}`}</div>
          </div>
          <div className="overflow-x-auto -mx-2 mb-6">
            <table className="min-w-full text-left text-xs font-mono text-amber-100/90">
              <thead>
                <tr className="border-b border-amber-900/40">
                  <th className="px-2 py-2 whitespace-nowrap">Updated</th>
                  <th className="px-2 py-2 whitespace-nowrap">Players</th>
                  <th className="px-2 py-2 whitespace-nowrap">Match</th>
                  <th className="px-2 py-2 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {liveMatches.map((m) => (
                  <tr key={m.matchId} className="border-b border-amber-900/20">
                    <td className="px-2 py-2 align-top whitespace-nowrap">{formatTime(m.updatedAt || m.createdAt)}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(m.players || []).map((p, idx) => (
                          <div
                            key={idx}
                            className={
                              'px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1 ' +
                              (p.isBot ? 'bg-slate-800/80 text-amber-200/80 border border-amber-900/50' : 'bg-amber-700/25 text-amber-50 border border-amber-500/20')
                            }
                          >
                            <span>{p.name || '(anon)'}</span>
                            {p.isBot && <span className="text-[9px] uppercase tracking-widest">BOT</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap text-amber-200/70">{String(m.matchId).slice(0, 8)}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => killMatch(m.matchId)}
                        className="px-2 py-1 rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-400/20 text-red-200/90 text-[11px] font-black"
                        title={String(m.matchId)}
                      >
                        Kill
                      </button>
                    </td>
                  </tr>
                ))}
                {liveMatches.length === 0 && (
                  <tr>
                    <td colSpan="3" className="px-2 py-4 text-center text-amber-300/60 text-xs">
                      No active matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black">Last games</div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-mono text-amber-200/50">show:</div>
              <select
                value={gamesWindow}
                onChange={(e) => setGamesWindow(e.target.value)}
                className="px-2 py-1 rounded-lg bg-black/40 border border-amber-900/30 text-amber-50/80 font-mono text-[11px]"
              >
                <option value="hour">last hour</option>
                <option value="day">today</option>
                <option value="week">week</option>
                <option value="all">all</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-hidden">
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs font-mono text-amber-100/90">
              <thead>
                <tr className="border-b border-amber-900/40">
                  <th className="px-2 py-2 whitespace-nowrap">Finished</th>
                  <th className="px-2 py-2 whitespace-nowrap">Match</th>
                  <th className="px-2 py-2 whitespace-nowrap">Players</th>
                  <th className="px-2 py-2 whitespace-nowrap">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredGames.map((g) => (
                  <tr key={g.matchId} className="border-b border-amber-900/20">
                    <td className="px-2 py-2 align-top whitespace-nowrap">{gamesWindow === 'day' ? formatTimeOnly(g.finishedAt || g.createdAt) : formatTime(g.finishedAt || g.createdAt)}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <button
                        type="button"
                        className="font-mono text-[11px] text-amber-200/70 hover:text-amber-50 underline underline-offset-4"
                        onClick={() => { copyAdminText(String(g.matchId || '')); }}
                        title={g.matchId}
                      >
                        {String(g.matchId || '').slice(0, 12)}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(g.players || []).map((p, idx) => {
                          const label = String(p?.name || '(anon)');
                          const isWin = !!label && label === String(g.winnerName || '');
                          const canOpen = !!String(p?.playerId || '').trim();
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!canOpen}
                              onClick={() => { if (canOpen) openProfileById(p.playerId, p.name); }}
                              className={
                                'px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1 border ' +
                                (isWin
                                  ? 'bg-emerald-700/25 border-emerald-400/40 text-emerald-100'
                                  : (p.isBot ? 'bg-slate-800/80 text-amber-200/80 border-amber-900/50' : 'bg-amber-700/25 text-amber-50 border-amber-500/20')) +
                                (canOpen ? ' hover:opacity-95' : ' opacity-80')
                              }
                              title={canOpen ? 'Open profile' : ''}
                            >
                              <span>{label}{isWin ? ' ★' : ''}</span>
                              {p.isBot && <span className="text-[9px] uppercase tracking-widest">BOT</span>}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{formatDuration(g.durationMs)}</td>
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-2 py-6 text-center text-amber-300/60 text-xs">
                      {summary ? 'No recorded games yet.' : 'Set token and refresh to load stats.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

              <div className="mt-2 flex items-center justify-center">
                <button
                  type="button"
                  disabled={loading || !gamesHasMore}
                  onClick={() => fetchAdmin({ loadMore: true })}
                  className="px-4 py-2 rounded-xl bg-black/40 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[11px] uppercase tracking-widest disabled:opacity-50"
                  title={(gamesTotalFinished != null) ? `${gamesOffset}/${gamesTotalFinished}` : ''}
                >
                  {gamesHasMore ? 'Load more' : 'No more'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ card, onClick, disabled, showCheck }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'relative w-40 aspect-[2/3] rounded-2xl overflow-hidden border shadow-2xl transition-transform ' +
        (disabled ? 'opacity-40 cursor-not-allowed border-black/30' : 'cursor-pointer hover:scale-[1.03] border-amber-500/30')
      }
      title={card?.id}
    >
      <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
      {showCheck && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-6 h-6 rounded-full bg-white/90 text-black border border-black/20 flex items-center justify-center text-[14px] font-black shadow">
          ✓
        </div>
      )}
    </button>
  );
}


function AdminBugreportsPage() {
  const [token, setToken] = useState(() => {
    try { return window.localStorage.getItem('politikum.adminToken') || ''; } catch { return ''; }
  });
  const saveToken = (t) => {
    const v = String(t || '');
    setToken(v);
    try { window.localStorage.setItem('politikum.adminToken', v); } catch {}
  };

  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(''); // '' | new | seen | done
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchList = async () => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    setLoading(true);
    setError('');
    try {
      const q = status ? `?status=${encodeURIComponent(status)}&limit=100` : `?limit=100`;
      const res = await fetch(`${SERVER}/admin/bugreports${q}`, { headers: { 'X-Admin-Token': token } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [status]);

  const setItemStatus = async (id, st) => {
    if (!token) { setError('Set X-Admin-Token first.'); return; }
    const sid = Number(id);
    if (!Number.isFinite(sid)) return;

    // optimistic update
    setItems((arr) => (arr || []).map((r) => (Number(r.id) === sid ? { ...r, status: st } : r)));

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/admin/bugreport/${encodeURIComponent(String(id))}/status`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ status: st }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      if (j?.ok === false) throw new Error(j?.error || 'failed');
      // re-fetch to confirm
      await fetchList();
    } catch (e) {
      setError(e?.message || String(e));
      await fetchList().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const fmt = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  return (
    <div className="min-h-screen w-screen overflow-x-hidden text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}>
      <div className="w-full max-w-5xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Admin / bugreports</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { window.location.hash = '#/admin'; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Stats</button>
            <button type="button" onClick={() => { window.location.hash = '#/admin/tournament'; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Tournaments</button>
            <button type="button" disabled className="text-xs font-mono text-amber-50/90 font-black">Bugreports</button>
            <button type="button" onClick={() => { window.location.hash = ''; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Exit</button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-widest text-amber-400 font-black block mb-1">X-Admin-Token</label>
            <input type="password" value={token} onChange={(e) => saveToken(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono" placeholder="Paste shared secret" />
          </div>
          <div className="flex items-end gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/40 text-amber-50 text-sm font-mono">
              <option value="">all</option>
              <option value="new">new</option>
              <option value="seen">seen</option>
              <option value="done">done</option>
            </select>
            <button type="button" onClick={fetchList} disabled={loading} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-amber-950 font-black text-xs uppercase tracking-widest">{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-xs font-mono text-red-300 bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2">Error: {error}</div>
        )}

        <div className="overflow-x-hidden -mx-2">
          <table className="w-full text-left text-xs font-mono text-amber-100/90" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="border-b border-amber-900/40">
                <th className="px-2 py-2 whitespace-nowrap w-[140px]">When</th>
                <th className="px-2 py-2 whitespace-nowrap w-[64px]">Status</th>
                <th className="px-2 py-2 whitespace-nowrap w-[96px]">Match</th>
                <th className="px-2 py-2 whitespace-nowrap w-[120px]">From</th>
                <th className="px-2 py-2">Text</th>
                <th className="px-2 py-2 whitespace-nowrap w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const isOpen = String(expandedId) === String(r.id);
                const txt = String(r.text || '').trim();
                const oneLine = txt.replace(/\s+/g, ' ').slice(0, 100);
                const matchShort = String(r.match_id || '').slice(0, 12) || '—';
                const from = r.name || r.player_id || '—';
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      className={"border-b border-amber-900/20 align-top cursor-pointer hover:bg-black/20"}
                      onClick={() => setExpandedId((v) => (String(v) === String(r.id) ? null : r.id))}
                      title="Click to expand"
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-amber-200/70">{fmt(r.created_at)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.status}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-amber-200/70">{matchShort}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{from}</td>
                      <td className="px-2 py-2">
                        <div className="whitespace-nowrap overflow-hidden text-ellipsis">{oneLine}{txt.length > oneLine.length ? '…' : ''}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button type="button" disabled={loading} onClick={() => setItemStatus(r.id, 'seen')} className="px-2 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700/70 disabled:opacity-60 text-amber-100 font-black text-[10px] uppercase tracking-widest">Seen</button>
                          <button type="button" disabled={loading} onClick={() => setItemStatus(r.id, 'done')} className="px-2 py-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/70 disabled:opacity-60 text-emerald-50 font-black text-[10px] uppercase tracking-widest">Done</button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-amber-900/20 bg-black/20">
                        <td colSpan="6" className="px-2 py-3">
                          <div className="text-[11px] font-mono text-amber-200/60 flex flex-wrap gap-3">
                            <span>id: {r.id}</span>
                            <span>match: {String(r.match_id || '—')}</span>
                            <span>from: {from}</span>
                            {(r.contact || '').trim() && <span>contact: {String(r.contact)}</span>}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm font-serif text-amber-50/90">{txt || '—'}</div>
                          {(r.context_json || '').trim() && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] font-mono text-amber-200/70">context_json</summary>
                              <pre className="mt-2 max-h-[260px] overflow-auto text-[10px] bg-black/40 border border-amber-900/20 rounded-xl p-2">{String(r.context_json)}</pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-2 py-6 text-center text-amber-300/60 text-xs">No bugreports.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DesktopLobbyBoard({ G, ctx, moves, playerID }) {
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));
  const isHost = String(playerID) === '0' || String(me?.name || '') === 'You';
  const [name, setName] = useState(() => {
    const cur = String(me?.name || '').trim();
    if (!cur) return '';
    if (cur.startsWith('[H] Seat')) return '';
    return cur;
  });

  // Auto-apply saved alias into the match lobby (seat name) on first load.
  useEffect(() => {
    try {
      const cur = String(me?.name || '').trim();
      if (cur && !cur.startsWith('[H] Seat') && cur !== 'You') return;
      const saved = String(window.localStorage.getItem('politikum.playerName') || '').trim();
      if (!saved) return;
      if (saved.startsWith('[H] Seat')) return;
      // Only auto-set for your own seat.
      if (String(playerID) !== String(me?.id ?? playerID)) return;
      try { moves.setPlayerName(saved); } catch {}
      setName(saved);
    } catch {}
  }, [me?.name, playerID]);
  const [chatInput, setChatInput] = useState('');
  const [ratingsMap, setRatingsMap] = useState(() => ({}));
  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profile, setProfile] = useState(null);

  const openProfileById = async (pid) => {
    const id = String(pid || '').trim();
    if (!id) return;
    setShowProfile(true);
    setProfileLoading(true);
    setProfileErr('');
    try {
      const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProfile(json);
    } catch (e) {
      setProfileErr(e?.message || String(e));
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SERVER}/public/leaderboard?limit=200`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const items = Array.isArray(json?.items) ? json.items : [];
        const m = {};
        for (const r of items) {
          const pid = String(r?.playerId || '').trim();
          if (!pid) continue;
          m[pid] = Math.round(Number(r?.rating || 0));
        }
        setRatingsMap(m);
      } catch {}
    })();
  }, []);

  // (Top10 moved to the Guest List screen; keep lobby light.)

  const [betaPassword, setBetaPassword] = useState('');
  const [authToken, setAuthToken] = useState(() => {
    try { return window.localStorage.getItem('politikum.authToken') || ''; } catch { return ''; }
  });
  const [authStatus, setAuthStatus] = useState('');

  const activeCount = (G.activePlayerIds || []).length;

  // Top10 moved to Guest List screen.

  const doBetaLogin = async () => {
    try {
      setAuthStatus('');
      const res = await fetch(`${SERVER}/auth/register_or_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(name || '').trim() || '',
          token: betaPassword,
          deviceId: (() => {
            try {
              let id = window.localStorage.getItem('politikum.deviceId');
              if (!id) {
                id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                window.localStorage.setItem('politikum.deviceId', id);
              }
              return id;
            } catch {
              return null;
            }
          })(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const tok = String(json?.token || '');
      if (!tok) throw new Error('No token returned');
      setAuthToken(tok);
      try { window.localStorage.setItem('politikum.authToken', tok); } catch {}

      // Bind stable player identity into match state (for Рейтинг/rankings).
      try {
        const pid = json?.playerId;
        if (pid) {
          try { window.localStorage.setItem('politikum.sessionPlayerId', String(pid)); } catch {}
          try { moves.setPlayerIdentity({ playerId: pid, email: null }); } catch {}
        }
      } catch {}

      setAuthStatus('Logged in');
    } catch (e) {
      setAuthStatus(`Login failed: ${e?.message || String(e)}`);
    }
  };

  return (
    <div
      className="min-h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex items-center justify-center p-6"
      style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}
    >
      {showProfile && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(520px,92vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Профиль</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">Доступен всем</div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
              >
                Закрыть
              </button>
            </div>

            {profileLoading && (
              <div className="mt-4 text-amber-200/80 font-mono text-[12px]">loading…</div>
            )}
            {!profileLoading && profileErr && (
              <div className="mt-4 text-red-200/90 font-mono text-[12px]">{profileErr}</div>
            )}
            {!profileLoading && !profileErr && profile?.ok && (
              <div className="mt-4 text-amber-100/90 font-mono text-[12px] space-y-2">
                <div className="flex items-center gap-4">
                  <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden border border-amber-900/20 bg-black/30">
                    <img
                      src={`/public/profile_image/${encodeURIComponent(String(profile.playerId || ''))}.jpg`}
                      onError={(e) => { try { e.currentTarget.src = `/cards/persona_${1 + ((Number(String(profile.playerId || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0)) || 0) % 45)}.webp`; } catch {} }}
                      className="w-full h-full object-cover"
                      alt="avatar"
                      draggable={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div><span className="text-amber-200/70">PlayerId:</span> {String(profile.playerId || '')}</div>
                      <a
                        className="px-3 py-2 rounded-xl bg-black/45 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
                        href={`/profile/${encodeURIComponent(String(profile.playerId || ''))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть публичный профиль
                      </a>
                    </div>
                    <div><span className="text-amber-200/70">Имя:</span> {String(profile.name || profile.username || '—')}</div>
                    <div><span className="text-amber-200/70">Рейтинг:</span> {Math.round(Number(profile.rating || 0))}</div>
                    <div><span className="text-amber-200/70">Игр:</span> {Number(profile.games || 0)}</div>
                    <div><span className="text-amber-200/70">Побед:</span> {Number(profile.wins || 0)} ({profile.games ? Math.round((Number(profile.wins || 0) / Math.max(1, Number(profile.games || 0))) * 100) : 0}%)</div>

                    {String(profile.bioText || '').trim() && (
                      <div className="mt-3 pt-3 border-t border-amber-900/20">
                        <div className="text-amber-200/70 text-[10px] uppercase tracking-[0.3em] font-black">about</div>
                        <div className="mt-2 whitespace-pre-wrap text-amber-50/85">{String(profile.bioText || '').trim()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Лобби</div>
          </div>
          {/* player count hidden */}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Main column */}
          <div className="flex flex-col gap-4 min-h-[520px]">
            {/* Lobby chat */}
            <div className="bg-slate-900/40 rounded-2xl p-4 border border-amber-900/20 flex flex-col flex-1 min-h-0">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Чат лобби</div>
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {(G.chat || []).map((m, i) => {
                  const sender = String(m?.sender || '').trim();
                  const p = (G.players || []).find((pp) => String(pp?.name || '').trim() === sender);
                  const pid = String(p?.identity?.playerId || '');
                  const r = pid ? ratingsMap[pid] : null;
                  return (
                    <div key={i} className="text-sm font-serif">
                      <button
                        type="button"
                        className="text-amber-200/60 font-mono text-[11px] mr-2 hover:text-amber-100"
                        onClick={() => { if (pid) openProfileById(pid); }}
                        disabled={!pid}
                        title={pid ? 'Открыть профиль' : ''}
                      >
                        {m.sender}{(r != null) ? ` (${r})` : ''}:
                      </button>
                      <span className="text-amber-50/90">{m.text}</span>
                    </div>
                  );
                })}
                {(!(G.chat || []).length) && <div className="text-amber-200/40 italic text-sm font-serif">Пока нет сообщений.</div>}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const msg = String(chatInput || '').trim();
                  if (!msg) return;
                  try { moves.submitChat(msg, String(me?.name || playerID)); } catch {}
                  setChatInput('');
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Напиши что-нибудь…"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-xs uppercase"
                >
                  Отправить
                </button>
              </form>
            </div>

          </div>

          {/* Side panel */}
          <div className="grid gap-4">
            {/* Beta login block removed from pregame lobby (register on main page). */}

            {/* Seats */}
            <div className="bg-slate-900/40 rounded-2xl p-3 border border-amber-900/20">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Игроки</div>
              <div className="mt-3 grid gap-2">
                {(G.players || []).filter((p) => !!p?.active).map((p) => {
                  const active = !!p.active;
                  const bot = !!p.isBot || String(p.name || '').startsWith('[B]');
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-amber-900/10">
                      <div className="flex items-center gap-2">
                        <div className={(active ? 'text-amber-100' : 'text-amber-900/50') + ' font-serif text-sm flex items-center gap-2'}>
                          <span>{p.name || `Seat ${p.id}`}</span>
                          {(() => {
                            const pid = String(p?.identity?.playerId || '').trim();
                            const r = pid ? ratingsMap?.[pid] : null;
                            if (!pid || r == null) return null;
                            return (
                              <button
                                type="button"
                                className="text-amber-100/80 hover:text-amber-100 underline underline-offset-2 text-[11px] font-mono"
                                title="Открыть профиль"
                                onClick={() => openProfileById(pid, String(p?.name || ''))}
                              >
                                ({r})
                              </button>
                            );
                          })()}
                        </div>
                        {active && bot && <div className="text-[10px] font-mono text-amber-200/50">(bot)</div>}
                      </div>

                      {isHost && String(p.id) !== '0' && active && bot && (
                        <button
                          onClick={() => moves.removePlayer(String(p.id))}
                          className="text-amber-600 hover:text-amber-400 font-black text-xs uppercase"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {isHost && (
                <div className="mt-4 flex gap-2 items-center">
                  <button
                    onClick={() => moves.addBot()}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-xs uppercase tracking-widest"
                  >
                    Добавить бота
                  </button>
                  <button
                    onClick={() => moves.startGame()}
                    className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-widest"
                  >
                    Старт
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* phase debug hidden */}
      </div>
    </div>
  );
}

function MobileLobbyBoard({ G, ctx, moves, playerID }) {
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));
  const isHost = String(playerID) === '0' || String(me?.name || '') === 'You';
  const [name, setName] = useState(() => {
    const cur = String(me?.name || '').trim();
    if (!cur) return '';
    if (cur.startsWith('[H] Seat')) return '';
    return cur;
  });

  // Auto-apply saved alias into the match lobby (seat name) on first load.
  useEffect(() => {
    try {
      const cur = String(me?.name || '').trim();
      if (cur && !cur.startsWith('[H] Seat') && cur !== 'You') return;
      const saved = String(window.localStorage.getItem('politikum.playerName') || '').trim();
      if (!saved) return;
      if (saved.startsWith('[H] Seat')) return;
      // Only auto-set for your own seat.
      if (String(playerID) !== String(me?.id ?? playerID)) return;
      try { moves.setPlayerName(saved); } catch {}
      setName(saved);
    } catch {}
  }, [me?.name, playerID]);
  const [chatInput, setChatInput] = useState('');
  const [ratingsMap, setRatingsMap] = useState(() => ({}));
  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profile, setProfile] = useState(null);

  const openProfileById = async (pid) => {
    const id = String(pid || '').trim();
    if (!id) return;
    setShowProfile(true);
    setProfileLoading(true);
    setProfileErr('');
    try {
      const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProfile(json);
    } catch (e) {
      setProfileErr(e?.message || String(e));
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SERVER}/public/leaderboard?limit=200`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const items = Array.isArray(json?.items) ? json.items : [];
        const m = {};
        for (const r of items) {
          const pid = String(r?.playerId || '').trim();
          if (!pid) continue;
          m[pid] = Math.round(Number(r?.rating || 0));
        }
        setRatingsMap(m);
      } catch {}
    })();
  }, []);

  // (Top10 moved to the Guest List screen; keep lobby light.)

  const [betaPassword, setBetaPassword] = useState('');
  const [authToken, setAuthToken] = useState(() => {
    try { return window.localStorage.getItem('politikum.authToken') || ''; } catch { return ''; }
  });
  const [authStatus, setAuthStatus] = useState('');

  const activeCount = (G.activePlayerIds || []).length;

  // Top10 moved to Guest List screen.

  const doBetaLogin = async () => {
    try {
      setAuthStatus('');
      const res = await fetch(`${SERVER}/auth/register_or_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(name || '').trim() || '',
          token: betaPassword,
          deviceId: (() => {
            try {
              let id = window.localStorage.getItem('politikum.deviceId');
              if (!id) {
                id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                window.localStorage.setItem('politikum.deviceId', id);
              }
              return id;
            } catch {
              return null;
            }
          })(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const tok = String(json?.token || '');
      if (!tok) throw new Error('No token returned');
      setAuthToken(tok);
      try { window.localStorage.setItem('politikum.authToken', tok); } catch {}

      // Bind stable player identity into match state (for Рейтинг/rankings).
      try {
        const pid = json?.playerId;
        if (pid) {
          try { window.localStorage.setItem('politikum.sessionPlayerId', String(pid)); } catch {}
          try { moves.setPlayerIdentity({ playerId: pid, email: null }); } catch {}
        }
      } catch {}

      setAuthStatus('Logged in');
    } catch (e) {
      setAuthStatus(`Login failed: ${e?.message || String(e)}`);
    }
  };

  const MOBILE = (() => {
    try {
      const sp = new URLSearchParams(String(window.location.search || ''));
      if (String(sp.get('ui') || '').trim() === 'desktop') return false;
    } catch {}
    return String(window.location.hash || '').startsWith('#/m');
  })();

  return (
    <div
      className="min-h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex items-center justify-center p-6"
      style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}
    >
      {showProfile && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(520px,92vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Профиль</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">Доступен всем</div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
              >
                Закрыть
              </button>
            </div>

            {profileLoading && (
              <div className="mt-4 text-amber-200/80 font-mono text-[12px]">loading…</div>
            )}
            {!profileLoading && profileErr && (
              <div className="mt-4 text-red-200/90 font-mono text-[12px]">{profileErr}</div>
            )}
            {!profileLoading && !profileErr && profile?.ok && (
              <div className="mt-4 text-amber-100/90 font-mono text-[12px] space-y-2">
                <div className="flex items-center gap-4">
                  <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden border border-amber-900/20 bg-black/30">
                    <img
                      src={`/public/profile_image/${encodeURIComponent(String(profile.playerId || ''))}.jpg`}
                      onError={(e) => { try { e.currentTarget.src = `/cards/persona_${1 + ((Number(String(profile.playerId || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0)) || 0) % 45)}.webp`; } catch {} }}
                      className="w-full h-full object-cover"
                      alt="avatar"
                      draggable={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div><span className="text-amber-200/70">PlayerId:</span> {String(profile.playerId || '')}</div>
                      <a
                        className="px-3 py-2 rounded-xl bg-black/45 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
                        href={`/profile/${encodeURIComponent(String(profile.playerId || ''))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть публичный профиль
                      </a>
                    </div>
                    <div><span className="text-amber-200/70">Имя:</span> {String(profile.name || profile.username || '—')}</div>
                    <div><span className="text-amber-200/70">Рейтинг:</span> {Math.round(Number(profile.rating || 0))}</div>
                    <div><span className="text-amber-200/70">Игр:</span> {Number(profile.games || 0)}</div>
                    <div><span className="text-amber-200/70">Побед:</span> {Number(profile.wins || 0)} ({profile.games ? Math.round((Number(profile.wins || 0) / Math.max(1, Number(profile.games || 0))) * 100) : 0}%)</div>

                    {String(profile.bioText || '').trim() && (
                      <div className="mt-3 pt-3 border-t border-amber-900/20">
                        <div className="text-amber-200/70 text-[10px] uppercase tracking-[0.3em] font-black">about</div>
                        <div className="mt-2 whitespace-pre-wrap text-amber-50/85">{String(profile.bioText || '').trim()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl">
        {!MOBILE && (
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
              <div className="text-amber-100/70 font-serif mt-1">Лобби</div>
            </div>
            {/* player count hidden */}
          </div>
        )}

        <div className={"mt-6 grid grid-cols-1 gap-4 " + (MOBILE ? "" : "") }>
          {/* Main column */}
          <div className={"flex flex-col gap-4 min-h-[520px] " + (MOBILE ? "" : "") }>

            {/* Seats (mobile: top) */}
            {MOBILE && (
              <div className="bg-slate-900/40 rounded-2xl p-3 border border-amber-900/20">
                <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Игроки</div>
                <div className="mt-3 grid gap-2">
                  {(G.players || []).filter((p) => !!p?.active).map((p) => {
                    const active = !!p.active;
                    const bot = !!p.isBot || String(p.name || '').startsWith('[B]');
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-amber-900/10">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            className={(active ? 'text-amber-100' : 'text-amber-900/50') + ' font-serif text-sm flex items-center gap-2 hover:text-amber-50 min-w-0'}
                            onClick={() => {
                              const pid = String(p?.identity?.playerId || '').trim();
                              if (pid) openProfileById(pid, String(p?.name || ''));
                            }}
                            disabled={!String(p?.identity?.playerId || '').trim()}
                            title={String(p?.identity?.playerId || '').trim() ? 'Открыть профиль' : ''}
                          >
                            <span className="truncate">{p.name || `Seat ${p.id}`}</span>
                            {(() => {
                              const pid = String(p?.identity?.playerId || '').trim();
                              const r = pid ? ratingsMap?.[pid] : null;
                              if (!pid || r == null) return null;
                              return <span className="text-amber-100/80 font-mono text-[11px]">({r})</span>;
                            })()}
                          </button>
                          {active && bot && <div className="text-[10px] font-mono text-amber-200/50">(bot)</div>}
                        </div>

                        {isHost && String(p.id) !== '0' && active && (
                          <button
                            type="button"
                            onClick={() => { if (confirm(`Remove ${p.name || p.id}?`)) moves.removePlayer(String(p.id)); }}
                            className="ml-2 px-2 py-1 rounded-lg bg-red-900/60 hover:bg-red-900/80 border border-red-900/30 text-red-100 font-black text-[10px] uppercase tracking-widest"
                          >
                            Убрать
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isHost && (
                  <div className="mt-4 flex gap-2 items-center">
                    <button
                      onClick={() => moves.addBot()}
                      className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-xs uppercase tracking-widest"
                    >
                      Добавить бота
                    </button>
                    <button
                      onClick={() => moves.startGame()}
                      className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-widest"
                    >
                      Старт
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lobby chat */}
            <div className={"bg-slate-900/40 rounded-2xl p-4 border border-amber-900/20 flex flex-col flex-1 min-h-0 " + (MOBILE ? ((G.chat || []).length ? "min-h-[62vh]" : "min-h-[30vh]") : "")}>
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Чат лобби</div>
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {(G.chat || []).map((m, i) => {
                  const sender = String(m?.sender || '').trim();
                  const p = (G.players || []).find((pp) => String(pp?.name || '').trim() === sender);
                  const pid = String(p?.identity?.playerId || '');
                  const r = pid ? ratingsMap[pid] : null;
                  return (
                    <div key={i} className="text-sm font-serif">
                      <button
                        type="button"
                        className="text-amber-200/60 font-mono text-[11px] mr-2 hover:text-amber-100"
                        onClick={() => { if (pid) openProfileById(pid); }}
                        disabled={!pid}
                        title={pid ? 'Открыть профиль' : ''}
                      >
                        {m.sender}{(r != null) ? ` (${r})` : ''}:
                      </button>
                      <span className="text-amber-50/90">{m.text}</span>
                    </div>
                  );
                })}
                {(!(G.chat || []).length) && <div className="text-amber-200/40 italic text-sm font-serif">Пока нет сообщений.</div>}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const msg = String(chatInput || '').trim();
                  if (!msg) return;
                  try { moves.submitChat(msg, String(me?.name || playerID)); } catch {}
                  setChatInput('');
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Напиши что-нибудь…"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm"
                />
                <button
                  type="submit"
                  className="w-12 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-lg"
                  title="Отправить"
                >
                  &gt;
                </button>
              </form>
            </div>

          </div>

          {/* Side panel hidden on mobile (players moved to top) */}
          {!MOBILE && (
          <div className="grid gap-4">
            {/* Beta login block removed from pregame lobby (register on main page). */}

            {/* Seats */}
            <div className="bg-slate-900/40 rounded-2xl p-3 border border-amber-900/20">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Игроки</div>
              <div className="mt-3 grid gap-2">
                {(G.players || []).filter((p) => !!p?.active).map((p) => {
                  const active = !!p.active;
                  const bot = !!p.isBot || String(p.name || '').startsWith('[B]');
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-amber-900/10">
                      <div className="flex items-center gap-2">
                        <div className={(active ? 'text-amber-100' : 'text-amber-900/50') + ' font-serif text-sm flex items-center gap-2'}>
                          <span>{p.name || `Seat ${p.id}`}</span>
                          {(() => {
                            const pid = String(p?.identity?.playerId || '').trim();
                            const r = pid ? ratingsMap?.[pid] : null;
                            if (!pid || r == null) return null;
                            return (
                              <button
                                type="button"
                                className="text-amber-100/80 hover:text-amber-100 underline underline-offset-2 text-[11px] font-mono"
                                title="Открыть профиль"
                                onClick={() => openProfileById(pid, String(p?.name || ''))}
                              >
                                ({r})
                              </button>
                            );
                          })()}
                        </div>
                        {active && bot && <div className="text-[10px] font-mono text-amber-200/50">(bot)</div>}
                      </div>

                      {isHost && String(p.id) !== '0' && active && bot && (
                        <button
                          onClick={() => moves.removePlayer(String(p.id))}
                          className="text-amber-600 hover:text-amber-400 font-black text-xs uppercase"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {isHost && (
                <div className="mt-4 flex gap-2 items-center">
                  <button
                    onClick={() => moves.addBot()}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-xs uppercase tracking-widest"
                  >
                    Добавить бота
                  </button>
                  <button
                    onClick={() => moves.startGame()}
                    className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-widest"
                  >
                    Старт
                  </button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
        {/* phase debug hidden */}
      </div>
    </div>
  );
}

function ActionBoard({ G, ctx, moves, playerID, matchID }) {
  const isHost = String(playerID) === '0';
  // H toggles on-screen hotkey hints (badges like (c)/(e)/(1..n)).

  const TokenPips = ({ delta, compact, right, dim }) => {
    const d = Number(delta || 0);
    if (!d) return null;
    const isNeg = d < 0;
    const n = Math.min(10, Math.abs(d));
    const more = Math.max(0, Math.abs(d) - 10);
    return (
      <div
        className={
          "absolute bottom-2 z-20 flex items-center gap-1 " +
          (right ? "right-2" : "left-2") +
          (compact ? " scale-[1.0]" : "") +
          (dim ? " opacity-80" : "")
        }
        style={{ pointerEvents: 'none' }}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className={
              "w-3.5 h-3.5 rounded-full border shadow-[0_2px_6px_rgba(0,0,0,0.6)] " +
              (isNeg ? "bg-red-700/95 border-red-200/50" : "bg-emerald-700/95 border-emerald-200/50")
            }
          />
        ))}
        {more > 0 && (
          <div
            className={
              "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black border " +
              (isNeg ? "bg-red-900/70 border-red-200/30 text-red-50" : "bg-emerald-900/70 border-emerald-200/30 text-emerald-50")
            }
          >
            ×{more + 10}
          </div>
        )}
      </div>
    );
  };

  const TokenPipsInline = ({ count, neg }) => {
    const d = Math.abs(Number(count || 0));
    if (!d) return null;
    const n = Math.min(10, d);
    const more = Math.max(0, d - 10);
    return (
      <div className="flex items-center gap-1" style={{ pointerEvents: 'none' }}>
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className={
              "w-3 h-3 rounded-full border shadow-[0_2px_6px_rgba(0,0,0,0.6)] " +
              (neg ? "bg-red-700/95 border-red-200/50" : "bg-emerald-700/95 border-emerald-200/50")
            }
          />
        ))}
        {more > 0 && (
          <div
            className={
              "ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black border " +
              (neg ? "bg-red-900/70 border-red-200/30 text-red-50" : "bg-emerald-900/70 border-emerald-200/30 text-emerald-50")
            }
          >
            ×{more + 10}
          </div>
        )}
      </div>
    );
  };
  const [goShowAllDetails, setGoShowAllDetails] = useState(false);

  const [showHotkeys, setShowHotkeys] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('politikum:soundOn') !== '0'; } catch { return true; }
  });

  const sfx = useMemo(() => {
    const mk = (file) => {
      const a = new Audio(`/assets/sfx/${file}`);
      a.preload = 'auto';
      return a;
    };
    return {
      draw: mk('card-slide-7.ogg'),
      play: mk('card-place-2.ogg'),
      flip: mk('cardflip.ogg'),
      coin: mk('coin.ogg'),
      ui: mk('switch_005.ogg'),
      error: mk('error_008.ogg'),
      win: mk('win.ogg'),
      lose: mk('lose.ogg'),
      fan: mk('card-fan-1.ogg'),
    };
  }, []);

  const playSfx = (key, vol = 0.6) => {
    if (!soundOn) return;
    const a = sfx?.[key];
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = vol;
      a.play();
    } catch {}
  };
  // Legacy states kept only to avoid touching large JSX blocks.
  // Hotkey/tutorial overlays are hard-disabled below.
  const [showTutorial, setShowTutorial] = useState(false);
  const [pickTargetForAction4, setPickTargetForAction4] = useState(null); // { cardId } (targeting mode)
  const [pickTargetForAction9, setPickTargetForAction9] = useState(null); // { cardId } (targeting mode)
  const [placementMode, setPlacementMode] = useState(null); // { cardId, neighborId, side }
  const [p16DiscardPick, setP16DiscardPick] = useState([]); // array of hand cardIds
  const [p7FirstPick, setP7FirstPick] = useState(null); // { ownerId, cardId }
  const [placementModeOpp, setPlacementModeOpp] = useState(null); // { cardId, targetId, neighborId, side }
  const [pickTargetForPersona9, setPickTargetForPersona9] = useState(null); // { cardId }
  const [p34WheelIdx, setP34WheelIdx] = useState(0);
  const logRef = React.useRef(null);
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));

  // Stable identity even for guests (prevents leaderboard mixing seatId "1" across many people).
  useEffect(() => {
    try {
      const already = String(me?.identity?.playerId || '').trim();
      if (already) return;

      // Prefer auth-bound player id.
      let pid = '';
      try { pid = String(window.localStorage.getItem('politikum.sessionPlayerId') || '').trim(); } catch {}

      if (!pid) {
        // Guest id: stable per-device.
        let deviceId = '';
        try { deviceId = String(window.localStorage.getItem('politikum.deviceId') || '').trim(); } catch {}
        if (!deviceId) {
          deviceId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          try { window.localStorage.setItem('politikum.deviceId', deviceId); } catch {}
        }
        pid = `guest_${deviceId}`;
        try { window.localStorage.setItem('politikum.sessionPlayerId', pid); } catch {}
      }

      try { moves.setPlayerIdentity({ playerId: pid, email: null }); } catch {}
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(me?.identity?.playerId || ''), playerID]);

  // ✓ = fully polished (per IMPLEMENTATION.md)
  const POLISHED = useMemo(() => {
    const s = new Set([
      // Events
      'event_1','event_2','event_3','event_10','event_11','event_12a','event_12b','event_12c','event_15','event_16',
      // Actions
      'action_4','action_5','action_6','action_7','action_8','action_9','action_13','action_14','action_17','action_18',
      // Personas
      'persona_1','persona_2','persona_3','persona_4','persona_5','persona_6','persona_14','persona_19','persona_20','persona_25','persona_27','persona_29','persona_30','persona_31','persona_35','persona_40','persona_42','persona_44'
    ]);
    return s;
  }, []);

  const isPolishedCard = (card) => {
    const bid = String(card?.id || '').split('#')[0];
    return POLISHED.has(bid);
  };
  const isMyTurn = String(ctx.currentPlayer) === String(playerID) && !G.gameOver;
  const current = (G.players || []).find((p) => String(p.id) === String(ctx.currentPlayer));
  const currentIsBot = String(current?.name || '').startsWith('[B]') || !!current?.isBot;

  // Bot driver election (lock-based): any human tab can drive bot ticks.
  // We use a localStorage lease so if the previous driver tab sleeps, another tab takes over.
  const BOT_LOCK_KEY = useMemo(() => {
    const mid = String(matchID || '');
    return mid ? `politikum.botDriverLock:${mid}` : 'politikum.botDriverLock';
  }, [matchID]);

  const isHumanSeat = !(String(me?.name || '').startsWith('[B]') || !!me?.isBot);

  const shouldDriveBots = useMemo(() => {
    try {
      if (!currentIsBot) return false;
      if (!isHumanSeat) return false;
      const now = Date.now();
      const raw = window.localStorage.getItem(BOT_LOCK_KEY);
      let lock = null;
      try { lock = raw ? JSON.parse(raw) : null; } catch { lock = null; }
      const holder = String(lock?.playerID || '');
      const ts = Number(lock?.ts || 0);
      const alive = ts && (now - ts) < 2500; // 2.5s lease
      if (!alive || holder === String(playerID)) return true;
      return false;
    } catch {
      return false;
    }
  }, [BOT_LOCK_KEY, currentIsBot, isHumanSeat, playerID]);

  // Tick driver election: needed for human-vs-human too (expires response windows + resolves deferred on-enter abilities).
  const TICK_LOCK_KEY = useMemo(() => {
    const mid = String(matchID || '');
    return mid ? `politikum.tickDriverLock:${mid}` : 'politikum.tickDriverLock';
  }, [matchID]);

  const shouldDriveTick = useMemo(() => {
    try {
      if (!isHumanSeat) return false;
      const now = Date.now();
      const raw = window.localStorage.getItem(TICK_LOCK_KEY);
      let lock = null;
      try { lock = raw ? JSON.parse(raw) : null; } catch { lock = null; }
      const holder = String(lock?.playerID || '');
      const ts = Number(lock?.ts || 0);
      const alive = ts && (now - ts) < 2500;
      if (!alive || holder === String(playerID)) return true;
      return false;
    } catch {
      return true;
    }
  }, [TICK_LOCK_KEY, isHumanSeat, playerID]);

  const refreshTickLease = () => {
    try {
      const now = Date.now();
      window.localStorage.setItem(TICK_LOCK_KEY, JSON.stringify({ playerID: String(playerID), ts: now }));
    } catch {}
  };

  const refreshBotLease = () => {
    try {
      const now = Date.now();
      window.localStorage.setItem(BOT_LOCK_KEY, JSON.stringify({ playerID: String(playerID), ts: now }));
    } catch {}
  };

  const response = G.response || null;
  const pending = G.pending || null;

  // Mobile: show a persistent cancel to exit local targeting modes.
  const mobileCancelTargeting = () => {
    try { setPlacementMode(null); } catch {}
    try { setPlacementModeOpp(null); } catch {}
    try { setPickTargetForAction4(null); } catch {}
    try { setPickTargetForAction9(null); } catch {}
    try { setPickTargetForPersona9(null); } catch {}
    try { setP7FirstPick(null); } catch {}
    try { setP16DiscardPick([]); } catch {}
    try { setMobileHandSelected(null); } catch {}
  };
  const responseKind = response?.kind || null;
  const responseExpiresAt = Number(response?.expiresAtMs || 0);
  const responseSecondsLeft = Math.max(0, Math.ceil((responseExpiresAt - Date.now()) / 1000));
  // Use a small grace window to avoid client clock skew blocking cancels.
  // Server enforces the real deadline.
  const responseActive = !!responseKind && (responseExpiresAt - Date.now()) > -750;
  const haveAction6 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
  const haveAction8 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
  const haveAction14 = (me?.hand || []).some((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_14');
  const responseTargetsMe = !!pending && (pending.kind === 'action_4_discard' || pending.kind === 'action_9_discard_persona') && String(pending.targetId) === String(playerID);
  const canPersona10Cancel = responseKind === 'cancel_action' && String(response?.allowPersona10By || '') === String(playerID) && responseTargetsMe;
  // IMPORTANT: don't include expiresAtMs in the key: server/client can drift and update it,
  // which would re-open the prompt even after user pressed Skip.
  const responseKey = responseKind ? `${responseKind}:${String(response?.playedBy || '')}:${String(response?.personaCard?.id || response?.actionCard?.id || '')}` : '';
  const [skippedResponseKey, setSkippedResponseKey] = useState('');
  useEffect(() => {
    // clear skip marker when response changes / closes
    if (!responseKey) { if (skippedResponseKey) setSkippedResponseKey(''); return; }
    if (skippedResponseKey && skippedResponseKey !== responseKey) setSkippedResponseKey('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseKey]);

  // If the same response window keeps re-opening (rare desync), auto-skip it client-side.
  useEffect(() => {
    try {
      if (!responseActive || !responseKey) return;
      const k = `politikum.skipResponse:${responseKey}`;
      const last = Number(window.localStorage.getItem(k) || 0);
      if (!last) return;
      if ((Date.now() - last) < 12_000) {
        try { setSkippedResponseKey(responseKey); } catch {}
        try { moves.skipResponseWindow(); } catch {}
      } else {
        try { window.localStorage.removeItem(k); } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseActive, responseKey]);

  const p8SwapSpec = responseKind === 'cancel_persona' ? (response?.persona8Swap || null) : null;
  const canPersona8Swap = !!p8SwapSpec && String(p8SwapSpec.playerId || '') === String(playerID);
  const [showEventSplash, setShowEventSplash] = useState(false);
  const [showActionSplash, setShowActionSplash] = useState(false);
  const ENABLE_EVENT_SPLASH = true;
  const ENABLE_ACTION_SPLASH = false;

  const MOBILE = (() => {
    try {
      const sp = new URLSearchParams(String(window.location.search || ''));
      if (String(sp.get('ui') || '').trim() === 'desktop') return false;
    } catch {}
    return String(window.location.hash || '').startsWith('#/m');
  })();
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [hoverHandIndex, setHoverHandIndex] = useState(null);
  const [hoverMyCoalition, setHoverMyCoalition] = useState(null);

  
  const [mobileHandSelected, setMobileHandSelected] = useState(null);
  const [mobileHandOpen, setMobileHandOpen] = useState(false);
  const [mobileOppInspect, setMobileOppInspect] = useState(null); // playerId
  const [mobileOppZoomPid, setMobileOppZoomPid] = useState(null);
  const [mobileOppFocus, setMobileOppFocus] = useState(null);
  const [mobileMyZoomCard, setMobileMyZoomCard] = useState(null);
  const [mobileAutoDiscardId, setMobileAutoDiscardId] = useState(null);

  // Mobile: when the hand drawer is closed, reset any zoom/selection so cards return to small size.
  useEffect(() => {
    if (!MOBILE) return;
    if (mobileHandOpen) return;
    setMobileHandSelected(null);
    setHoverHandIndex(null);
    setHoverMyCoalition(null);
  }, [MOBILE, mobileHandOpen]);

  useEffect(() => {
    if (!MOBILE) return;
    if (G.pending?.kind === 'discard_down_to_7' && mobileAutoDiscardId) {
      try { moves.discardFromHandDownTo7(mobileAutoDiscardId); } catch {}
      setMobileAutoDiscardId(null);
    }
  }, [MOBILE, G.pending?.kind, mobileAutoDiscardId]);

  const [bugModal, setBugModal] = useState(false);
  const [bugText, setBugText] = useState('');
  const [bugContact, setBugContact] = useState('');
  const [bugSent, setBugSent] = useState(null);

  useEffect(() => {
    if (pending?.kind === 'persona_28_pick_non_fbk') setHoverMyCoalition(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.kind]);
  const [hoverOppCoalition, setHoverOppCoalition] = useState({}); // { [playerId]: idx }

  const hand = me?.hand || [];

  const grouped = useMemo(() => {
    const by = { persona: [], action: [], event: [] };
    for (const c of hand) (by[c.type] ||= []).push(c);
    return by;
  }, [hand]);

  const opponents = useMemo(() => {
    return (G.players || [])
      .filter((p) => String(p.id) !== String(playerID))
      .filter((p) => !!p?.active)
      .filter((p) => {
        const n = String(p?.name || '').trim();
        if (!n) return false;
        if (n.startsWith('[H] Seat')) return false;
        return true;
      });
  }, [G.players, playerID]);

  useEffect(() => {
    if (!MOBILE) return;
    if (mobileOppFocus != null) return;
    const first = (opponents || [])[0];
    if (first) setMobileOppFocus(String(first.id));
  }, [MOBILE, opponents, mobileOppFocus]);

  // Auto-pick sole opponent for flows that start with “choose opponent”.
  useEffect(() => {
    const only = opponents?.length === 1 ? opponents[0] : null;
    if (!only) return;

    // action_4/action_9: target player
    if (pickTargetForAction4) {
      try { moves.playAction(pickTargetForAction4.cardId, String(only.id)); } catch {}
      setPickTargetForAction4(null);
      return;
    }
    // action_9 can target yourself too → no auto-pick.

    // persona_9: must be played into opponent coalition
    if (pickTargetForPersona9) {
      try { moves.playPersona(pickTargetForPersona9.cardId, undefined, 'right', String(only.id)); } catch {}
      setPickTargetForPersona9(null);
      return;
    }

    // persona_17/p45: target player
    if (pending?.kind === 'persona_17_pick_opponent' && String(pending?.playerId) === String(playerID)) {
      try { moves.persona17PickOpponent(String(only.id)); } catch {}
      return;
    }
    if (pending?.kind === 'persona_45_steal_from_opponent' && String(pending?.playerId) === String(playerID)) {
      try { moves.persona45StealFromOpponent(String(only.id)); } catch {}
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponents, pickTargetForAction4, pickTargetForAction9, pickTargetForPersona9, pending?.kind]);

  const myVpBase = (me?.coalition || []).reduce((s, c) => s + Number(c.baseVp ?? c.vp ?? 0), 0);
  const myVpTokens = (me?.coalition || []).reduce((s, c) => s + Number(c.vpDelta || 0), 0);
  const myVpPassives = (me?.coalition || []).reduce((s, c) => s + Number(c.passiveVpDelta || 0), 0);
  const myCoalitionPoints = (me?.coalition || []).reduce((s, c) => s + Number(c.vp ?? (Number(c.baseVp ?? 0) + Number(c.vpDelta || 0) + Number(c.passiveVpDelta || 0))), 0);

  const pendingTokens = pending?.kind === 'place_tokens_plus_vp' && String(pending?.playerId) === String(playerID);
  const pendingTokensRemaining = pendingTokens ? Number(pending?.remaining || 0) : 0;
  const pendingTokensSource = pendingTokens ? String(pending?.sourceCardId || '') : '';

  const pendingTokensBase = String(pendingTokensSource || '').split('#')[0];
  const pendingTokensSingleTarget = pendingTokensBase === 'event_1';
  const [pendingTokensTargetId, setPendingTokensTargetId] = useState(null);
  const [pendingTokensLastSource, setPendingTokensLastSource] = useState('');
  useEffect(() => {
    if (!pendingTokens) {
      if (pendingTokensTargetId) setPendingTokensTargetId(null);
      if (pendingTokensLastSource) setPendingTokensLastSource('');
      return;
    }
    if (pendingTokensSource !== pendingTokensLastSource) {
      setPendingTokensLastSource(pendingTokensSource);
      setPendingTokensTargetId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTokens, pendingTokensSource]);

  const pendingPersona45 = pending?.kind === 'persona_45_steal_from_opponent' && String(pending?.playerId) === String(playerID);
  const pendingPersona45Source = pendingPersona45 ? String(pending?.sourceCardId || '') : '';

  // Auto-pick opponent when only one choice.
  useEffect(() => {
    if (!pendingPersona45) return;
    try {
      const opps = (G.players || []).filter((pp) => String(pp?.id) !== String(playerID) && pp?.active);
      if (opps.length === 1) {
        moves.persona45StealFromOpponent(String(opps[0].id));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPersona45]);

  const pendingP21 = pending?.kind === 'persona_21_pick_target_invert' && String(pending?.playerId) === String(playerID);
  const pendingP21Source = pendingP21 ? String(pending?.sourceCardId || '') : '';
  const pendingP23 = pending?.kind === 'persona_23_choose_self_inflict_draw' && String(pending?.playerId) === String(playerID);
  const pendingP23Source = pendingP23 ? String(pending?.sourceCardId || '') : '';
  const pendingP26 = pending?.kind === 'persona_26_pick_red_nationalist' && String(pending?.playerId) === String(playerID);
  const pendingP26Source = pendingP26 ? String(pending?.sourceCardId || '') : '';
  const pendingP28 = pending?.kind === 'persona_28_pick_non_fbk' && String(pending?.playerId) === String(playerID);
  const pendingP28Source = pendingP28 ? String(pending?.sourceCardId || '') : '';

  const pendingP32 = pending?.kind === 'persona_32_pick_bounce_target' && String(pending?.playerId) === String(playerID);
  const pendingP32Source = pendingP32 ? String(pending?.sourceCardId || '') : '';

  const pendingP37 = pending?.kind === 'persona_37_pick_opponent_persona' && String(pending?.playerId) === String(playerID);
  const pendingP37Source = pendingP37 ? String(pending?.sourceCardId || '') : '';

  const pendingP13 = pending?.kind === 'persona_13_pick_target' && String(pending?.playerId) === String(playerID);
  const pendingP13Source = pendingP13 ? String(pending?.sourceCardId || '') : '';
  const pendingP13AttackerId = pendingP13 ? String(pending?.attackerId || '') : '';

  const pendingP33 = pending?.kind === 'persona_33_choose_faction' && String(pending?.playerId) === String(playerID);
  const pendingP33Source = pendingP33 ? String(pending?.sourceCardId || '') : '';
  const pendingP34 = pending?.kind === 'persona_34_guess_topdeck' && String(pending?.playerId) === String(playerID);
  const pendingP34Source = pendingP34 ? String(pending?.sourceCardId || '') : '';
  const canUseP39 = isMyTurn && !G.pending && !G.response && (me?.coalition || []).some((c) => String(c.id).split('#')[0] === 'persona_39');

  const p34Remaining = useMemo(() => {
    if (!pendingP34) return [];
    const ALL = Array.from({ length: 45 }, (_, i) => `persona_${i + 1}`);
    const playedOrDiscarded = new Set();
    const myHand = new Set();
    try {
      for (const pp of (G.players || [])) {
        for (const c of (pp.coalition || [])) playedOrDiscarded.add(String(c.id).split('#')[0]);
      }
      for (const c of (G.discard || [])) playedOrDiscarded.add(String(c.id).split('#')[0]);
      const me2 = (G.players || []).find((pp) => String(pp.id) === String(playerID));
      for (const c of (me2?.hand || [])) myHand.add(String(c.id).split('#')[0]);
    } catch {}
    return ALL.filter((id) => !playedOrDiscarded.has(id) && !myHand.has(id));
  }, [G, playerID, pendingP34]);

  useEffect(() => {
    if (!pendingP34) return;
    setP34WheelIdx(0);
  }, [pendingP34, p34Remaining.length]);

  const pendingP16 = pending?.kind === 'persona_16_discard3_from_hand' && String(pending?.playerId) === String(playerID);
  const pendingHandLimit = isMyTurn && !pending && !responseActive && (me?.hand || []).length > 7;
  const pendingP16Source = pendingP16 ? String(pending?.sourceCardId || '') : '';

  const pendingP12 = pending?.kind === 'persona_12_choose_adjacent_red' && String(pending?.playerId) === String(playerID);
  const pendingP12Left = pendingP12 ? String(pending?.leftId || '') : '';
  const pendingP12Right = pendingP12 ? String(pending?.rightId || '') : '';

  const pendingP7 = pending?.kind === 'persona_7_swap_two_in_coalition' && String(pending?.playerId) === String(playerID);
  const pendingP7Source = pendingP7 ? String(pending?.sourceCardId || '') : '';

  const pendingP11Offer = pending?.kind === 'persona_11_offer' && String(pending?.playerId) === String(playerID);
  const pendingP11Pick = pending?.kind === 'persona_11_pick_opponent_persona' && String(pending?.playerId) === String(playerID);

  const pendingP17PickOpp = pending?.kind === 'persona_17_pick_opponent' && String(pending?.playerId) === String(playerID);
  const pendingP17PickCard = pending?.kind === 'persona_17_pick_persona_from_hand' && String(pending?.playerId) === String(playerID);
  const pendingP17TargetId = pendingP17PickCard ? String(pending?.targetId || '') : '';


  const isImmovablePersona = (card) => card?.type === 'persona' && String(card.id).split('#')[0] === 'persona_31';

  // Hand fan geometry (ported from Citadel MP)
  const cards = hand;
  const fanN = Math.max(1, cards.length);
  const cardW = 144; // ~ w-36
  const handStep = Math.min(28, Math.max(10, 180 / Math.max(1, fanN - 1)));
  const handWidth = cardW + (fanN - 1) * handStep;

  const scaleByDist = (dist) => {
    if (dist == 0) return 2;
    if (dist == 1) return 1.35;
    if (dist == 2) return 1.15;
    return 1;
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      // ignore typing
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return;

      const key = String(e.key || '').toLowerCase();

      if (key === 'escape') {
        if (pendingP11Offer) {
          try { playSfx('ui', 0.25); moves.persona11Skip(); } catch {}
          return;
        }
        if (G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId)) {
          try { playSfx('ui', 0.25); moves.persona3Skip(); } catch {}
          return;
        }
      }

      if (key === 'l') {
        setLogCollapsed((v) => !v);
        return;
      }
      if (key === 'escape') {
        setShowWhereAmI(false);
        setPickTargetForAction4(null);
        setPickTargetForAction9(null);
        setPlacementMode(null);
        setP16DiscardPick([]);
        setP7FirstPick(null);
        if (pendingP32) { try { moves.persona32CancelBounce(); } catch {} }
        // generic pending cancel (stability)
        if (G.pending && String(G.pending.playerId || G.pending.attackerId || G.pending.targetId || '') === String(playerID)) {
          try { moves.cancelPending(); } catch {}
        }
        return;
      }
      if (key === 'h') {
        setShowHotkeys((v) => !v);
        return;
      }
      if (key === 'm') {
        setSoundOn((v) => {
          const nv = !v;
          try { localStorage.setItem('politikum:soundOn', nv ? '1' : '0'); } catch {}
          return nv;
        });
        playSfx('ui', 0.4);
        return;
      }
      if (key === 't') {
        setShowTutorial((v) => !v);
        return;
      }
      if (key === 'c') {
        if (!isMyTurn || G.pending || G.hasDrawn) return;
        playSfx('draw');
        moves.drawCard();
        return;
      }
      if (key === 'e') {
        if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return;
        playSfx('ui');
        moves.endTurn();
        return;
      }

      // Response hotkeys
      if (responseKind && key === '2') {
        // skip/decline response window (allow actor too)
        if (responseActive) {
          try {
            setSkippedResponseKey(responseKey);
            window.localStorage.setItem(`politikum.skipResponse:${responseKey}`, String(Date.now()));
          } catch {}
          try { moves.skipResponseWindow(); } catch {}
        }
        return;
      }
      if (responseKind && key === '3') {
        // p8 swap during cancel_persona window
        if (responseActive && responseKind === 'cancel_persona' && canPersona8Swap && String(response?.playedBy) !== String(playerID)) {
          try { moves.persona8SwapWithPlayedPersona(); } catch {}
        }
        return;
      }

      // Fast cancels during response windows
      if (responseKind && key === '1') {
        // action_6 cancels actions (anyone)
        if (responseKind === 'cancel_action' && String(response?.playedBy) !== String(playerID)) {
          const c6 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_6');
          if (c6) moves.playAction(c6.id);
        }
        // action_8 cancels persona plays (anyone)
        if (responseKind === 'cancel_persona' && String(response?.playedBy) !== String(playerID)) {
          const c8 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_8');
          if (c8) moves.playAction(c8.id);
        }
        // action_14 cancels the effect of an action that is targeting YOU
        if (responseKind === 'cancel_action' && responseTargetsMe) {
          const c14 = (me?.hand || []).find((c) => c.type === 'action' && String(c.id).split('#')[0] === 'action_14');
          if (c14) moves.playAction(c14.id);
        }
        return;
      }

      // p3: option B hotkey
      if (G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && key === 'b') {
        try { moves.persona3ChooseOption('b'); } catch {}
        return;
      }

      // p33 choice: faction
      if (pendingP33) {
        const map = {
          '1': 'faction:liberal',
          '2': 'faction:rightwing',
          '3': 'faction:leftwing',
          '4': 'faction:fbk',
          '5': 'faction:red_nationalist',
          '6': 'faction:system',
          '7': 'faction:neutral',
        };

        // Support both normal digits and numpad.
        const code = String(e.code || '');
        const codeDigit = code.startsWith('Digit') ? code.slice(5) : (code.startsWith('Numpad') ? code.slice(6) : '');
        const k = (key >= '1' && key <= '7') ? key : (codeDigit >= '1' && codeDigit <= '7' ? codeDigit : '');

        if (k) {
          try { moves.persona33ChooseFaction(map[k]); } catch {}
          return;
        }
      }

      // p34 guess (1..N from remaining unseen personas)
      if (pendingP34) {
        const ALL = Array.from({ length: 45 }, (_, i) => `persona_${i + 1}`);
        const seen = new Set();
        try {
          for (const pp of (G.players || [])) {
            for (const c of (pp.hand || [])) seen.add(String(c.id).split('#')[0]);
            for (const c of (pp.coalition || [])) seen.add(String(c.id).split('#')[0]);
          }
          for (const c of (G.discard || [])) seen.add(String(c.id).split('#')[0]);
        } catch {}
        const remaining = ALL.filter((id) => !seen.has(id));
        const code = String(e.code || '');
        const codeDigit = code.startsWith('Digit') ? code.slice(5) : (code.startsWith('Numpad') ? code.slice(6) : '');
        const k = (key >= '1' && key <= '9') ? key : (codeDigit >= '1' && codeDigit <= '9' ? codeDigit : '');
        if (k) {
          const idx = Number(k) - 1;
          const pick = remaining[idx];
          if (pick) {
            try { moves.persona34GuessTopdeck(pick); } catch {}
            return;
          }
        }
        if (key === 'escape') {
          try { moves.persona34GuessTopdeck('skip'); } catch {}
          return;
        }
      }

      // p39 activate
      if (canUseP39 && key === 'r') {
        try { moves.persona39ActivateRecycle(); } catch {}
        return;
      }

      // p13 retaliation (out-of-turn): allow skipping with Esc
      if (pendingP13 && key === 'escape') {
        try { moves.persona13Skip(); } catch {}
        return;
      }

      // p23 choice: 0..3 tokens
      if (pendingP23 && (key === '1' || key === '2' || key === '3')) {
        try { moves.persona23ChooseSelfInflict(Number(key)); } catch {}
        return;
      }
      if (pendingP23 && key === 'escape') {
        try { moves.persona23ChooseSelfInflict(0); } catch {}
        return;
      }

      // p16 discard3: press 1..9 to toggle cards, Enter to confirm
      if (pendingP16) {
        if (key >= '1' && key <= '9') {
          const idx = Number(key) - 1;
          const c = (me?.hand || [])[idx];
          if (!c) return;
          setP16DiscardPick((arr) => {
            const s = new Set(arr || []);
            if (s.has(c.id)) s.delete(c.id);
            else s.add(c.id);
            return Array.from(s).slice(0, 3);
          });
          return;
        }
        if (key === 'enter') {
          const ids = (p16DiscardPick || []).slice(0, 3);
          if (ids.length < Math.min(3, (me?.hand || []).length)) return;
          try { moves.persona16Discard3FromHand(ids[0], ids[1], ids[2]); } catch {}
          setP16DiscardPick([]);
          return;
        }
      }

      // Number hotkeys for hand (quick-play): 1..9, 0 = 10
      if (!responseActive && !pendingP23 && !pendingP16 && (key === '0' || (key >= '1' && key <= '9'))) {
        const n = key === '0' ? 10 : Number(key);
        const idx = n - 1;
        const card = (me?.hand || [])[idx];
        if (!card) return;

        const baseId = String(card.id).split('#')[0];
        const canPlayPersona = isMyTurn && G.hasDrawn && card.type === 'persona';
        const canPlayAction = isMyTurn && G.hasDrawn && !G.hasPlayed && card.type === 'action';
        if (canPlayPersona) moves.playPersona(card.id);
        else if (canPlayAction) {
          if (baseId === 'action_4') setPickTargetForAction4({ cardId: card.id });
          else if (baseId === 'action_9') setPickTargetForAction9({ cardId: card.id });
          else moves.playAction(card.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, G.hasDrawn, G.hasPlayed, moves, responseKind, responseSecondsLeft, response?.playedBy, playerID, me?.hand, pendingP16, p16DiscardPick]);

  // Drive bot turns (pacing): tick only when it's a bot turn.
  // Calling tickBot during human turns causes invalid stateID spam and can wedge the match.
  useEffect(() => {
    if (G?.gameOver) return;
    if (!currentIsBot) return;
    // Only one client should drive bot ticks; otherwise other players spam INVALID_MOVE due to stateID/turn mismatch.
    if (!shouldDriveBots) return;

    const t = setInterval(() => {
      refreshBotLease();
      try { moves.tickBot(); } catch {}
    }, 900);
    return () => clearInterval(t);
  }, [moves, currentIsBot, G?.gameOver, shouldDriveBots]);

  // Human-side tick: clears expired response windows + auto-ends stuck turns once response closes.
  useEffect(() => {
    if (G?.gameOver) return;
    if (!shouldDriveTick) return; // single driver
    const needTick = !!G.response || String(G.pending?.kind || '') === 'resolve_persona_after_response';
    if (!needTick) return;

    const t = setInterval(() => {
      refreshTickLease();
      try { moves.tick(); } catch {}
    }, 500);
    return () => clearInterval(t);
  }, [moves, G?.response, G?.pending?.kind, G?.gameOver, shouldDriveTick]);

  // Event splash: show only when an event is actively being resolved AND it just changed.
  // On refresh, G.lastEvent can still point at an old event; never full-screen it on first render.
  const lastEventSeenRef = useRef(null);
  useEffect(() => {
    const id = G.lastEvent?.id ? String(G.lastEvent.id) : '';
    if (!id) { setShowEventSplash(false); lastEventSeenRef.current = null; return; }

    // First render for this client session: mark seen and do not show.
    if (lastEventSeenRef.current == null) {
      lastEventSeenRef.current = id;
      setShowEventSplash(false);
      return;
    }

    // Only show when the event id changes, and only if something is pending.
    if (String(lastEventSeenRef.current) !== id && G.pending) {
      lastEventSeenRef.current = id;
      setShowEventSplash(true);
      return;
    }

    // Otherwise keep it hidden.
    setShowEventSplash(false);
  }, [G.lastEvent?.id, !!G.pending]);

  useEffect(() => {
    if (!showEventSplash) return;
    // When no pending decisions remain, fade the event card shortly after.
    if (G.pending) return;
    const t = setTimeout(() => setShowEventSplash(false), 5000);
    return () => clearTimeout(t);
  }, [showEventSplash, G.pending]);

  // Autoscroll log to bottom on new lines
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // next tick so layout updates first
    const t = setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(t);
  }, [(G.log || []).length]);

  useEffect(() => {
    const id = G.lastAction?.id;
    if (!id) return;
    setShowActionSplash(true);
    const t = setTimeout(() => setShowActionSplash(false), 2000);
    return () => clearTimeout(t);
  }, [G.lastAction?.id]);

  const [hudToast, setHudToast] = useState('');

  const toast = (t) => {
    setHudToast(String(t || ''));
    try { setTimeout(() => setHudToast(''), 1500); } catch {}
  };

  const copyText = (txt) => {
    const s = String(txt ?? '');

    // 1) Clipboard API
    try {
      const fn = navigator.clipboard?.writeText;
      if (fn) {
        fn.call(navigator.clipboard, s);
        toast('copied');
        return true;
      }
    } catch {}

    // 2) execCommand fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, s.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { toast('copied'); return true; }
    } catch {}

    // 3) prompt fallback
    try { window.prompt('Copy to clipboard:', s); toast('prompt'); return false; } catch {}

    toast('copy failed');
    return false;
  };

  const buildBugReport = () => {
    const appSha = (typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit');
    const appShort = (typeof __GIT_SHA_SHORT__ !== 'undefined' ? __GIT_SHA_SHORT__ : String(appSha).slice(0, 7));
    const appBranch = (typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit');
    const engShort = (typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? __ENGINE_GIT_SHA_SHORT__ : 'nogit');

    const pend = (G && (G.pending || (G.pending === 0))) ? G.pending : null;
    const resp = (G && (G.response || (G.response === 0))) ? G.response : null;

    return {
      ts: new Date().toISOString(),
      matchID: matchID || null,
      playerID: playerID ?? null,
      app: { branch: appBranch, sha: appSha, short: appShort },
      engine: { short: engShort },
      ctx: {
        phase: ctx?.phase ?? null,
        currentPlayer: ctx?.currentPlayer ?? null,
        gameover: ctx?.gameover ?? null,
      },
      state: {
        hasDrawn: !!G?.hasDrawn,
        hasPlayed: !!G?.hasPlayed,
        lastEvent: G?.lastEvent?.id ?? null,
        lastAction: G?.lastAction?.id ?? null,
      },
      pending: pend,
      response: resp,
    };
  };

  return (
    <div className="w-full min-h-screen bg-[url('/assets/ui/table_v2.webp')] bg-cover bg-center text-amber-100">
      {bugModal && (
        <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm pointer-events-auto flex items-center justify-center" onClick={() => setBugModal(false)}>
          <div className="w-[min(720px,92vw)] rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Сообщить баг</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">match: {String(matchID || '').slice(0, 12) || '—'}</div>
              </div>
              <button type="button" onClick={() => setBugModal(false)} className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest">Закрыть</button>
            </div>

            <div className="mt-3 grid gap-2">
              <textarea
                value={bugText}
                onChange={(e) => setBugText(e.target.value)}
                placeholder="Опиши что случилось (что нажал, что ожидал, что увидел)…"
                className="w-full h-28 px-3 py-2 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm"
              />
              <input
                value={bugContact}
                onChange={(e) => setBugContact(e.target.value)}
                placeholder="Контакт (опционально): telegram @ / email"
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => copyText(JSON.stringify(buildBugReport(), null, 2))}
                  className="px-3 py-2 rounded-xl bg-black/45 hover:bg-black/60 border border-amber-900/25 text-amber-50 font-black text-[11px]"
                >
                  Скопировать тех.данные
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const text = String(bugText || '').trim();
                    if (!text) { setBugSent('Напиши текст'); return; }
                    setBugSent('Отправляю…');
                    try {
                      const payload = {
                        text,
                        contact: String(bugContact || '').trim() || null,
                        matchId: matchID || null,
                        playerId: (me?.identity?.playerId || me?.name || playerID || null),
                        name: (me?.name || null),
                        context: buildBugReport(),
                        url: String(window.location.href || ''),
                      };
                      const res = await fetch('/public/bugreport', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const j = await res.json().catch(() => ({}));
                      setBugSent(j?.id ? `Отправлено (#${j.id})` : 'Отправлено');
                      setBugText('');
                    } catch (e) {
                      setBugSent(e?.message || String(e));
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 font-black text-[11px] uppercase tracking-widest"
                >
                  Отправить
                </button>
              </div>
              {!!bugSent && <div className="text-[12px] font-mono text-amber-200/80">{bugSent}</div>}
            </div>
          </div>
        </div>
      )}

      {showHotkeys && (
      <div className="fixed top-3 left-3 z-[2000] select-none">
        <div className="mb-1 pointer-events-none select-none text-amber-200/70 font-black tracking-[0.35em] uppercase text-[10px]">Politikum</div>
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => {
              try {
                const full = (typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit');
                copyText(full);
              } catch {}
            }}
            className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90"
            title={`app ${typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit'}\nengine ${typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? __ENGINE_GIT_SHA_SHORT__ : 'nogit'}\n(click to copy full app sha)`}
          >
            {typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit'}@{typeof __GIT_SHA_SHORT__ !== 'undefined' ? __GIT_SHA_SHORT__ : (typeof __GIT_SHA__ !== 'undefined' ? String(__GIT_SHA__).slice(0,7) : 'nogit')}
            {typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? ` · eng@${__ENGINE_GIT_SHA_SHORT__}` : ''}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(String(matchID || ''))}
              className="pointer-events-auto bg-black/55 border border-amber-900/25 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/85"
              title="Match ID (click to copy)"
            >
              match:{matchID ? String(matchID).slice(0, 8) : '—'}
            </button>

            <button
              type="button"
              onClick={() => { try { setBugModal(true); setBugSent(null); } catch {} }}
              className="pointer-events-auto bg-slate-800/60 hover:bg-slate-700/70 border border-amber-900/20 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-100/90"
              title="Report bug"
            >
              Bug
            </button>

            {hudToast && (
              <div className="pointer-events-none text-[10px] font-mono text-amber-200/80">
                {hudToast}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* (admin link removed from in-game UI) */}

      {/* Opponents */}
      <div className="fixed top-20 z-[700] flex justify-evenly pointer-events-auto" style={MOBILE ? { left: '-36px', right: '36px' } : { left: 0, right: 0 }}>
        {(MOBILE ? opponents.filter((p) => String(p.id) === String(mobileOppFocus || (opponents[0]?.id))) : opponents).map((p) => {
          const hand0 = p.hand || [];
          const coal = (p.coalition || []);
          const nHand = (hand0 || []).length;
          const nCoal = (coal || []).length;
          const nTotal = nHand + nCoal;

          const pts = (coal || []).reduce((s, c) => s + Number(c.vp || 0), 0); // MVP points

          const oppPid = String(p?.identity?.playerId || '').trim();
          const oppRating = oppPid ? ratingsMap?.[oppPid] : null;

          // Opponent fan cards
          const backs = Array.from({ length: nHand }, () => ({ kind: 'back' }));
          const faces = coal.map((c) => ({ kind: 'face', card: c }));

          // Mobile: don't show hidden (unplayed) hand cards at all.
          // Desktop: show some backs + all coalition faces.
          const MAX_SHOW = 12;
          const backsShown = Math.min(nHand, Math.max(0, MAX_SHOW - faces.length));
          const oppFanCards = MOBILE ? faces : [...backs.slice(0, backsShown), ...faces];

          const show = oppFanCards.length;
          const stepBack = 9;  // tight (+50%)
          const flatP5 = MOBILE && opponents.length === 1 && G.pending?.kind === 'persona_5_pick_liberal' && String(playerID) === String(G.pending?.playerId);
          const stepFace = flatP5 ? 51 : (MOBILE ? 33 : 36); // flat row for p5 targeting (+50%)

          const calcWidth = () => {
            const shown = oppFanCards.slice(0, show);
            let w = 140;
            for (let i = 1; i < shown.length; i++) {
              w += shown[i].kind === 'back' ? stepBack : stepFace;
            }
            return w;
          };
          const width = calcWidth();
          const hoverIdx = flatP5 ? null : (hoverOppCoalition?.[p.id] ?? null);

          const scaleByDist2 = (dist) => {
            if (dist === 0) return 1.8;
            if (dist === 1) return 1.25;
            if (dist === 2) return 1.10;
            return 1;
          };

          return (
            <div key={p.id} className="flex flex-col items-center gap-2 relative pt-10 px-6">
              {/* name/points as absolute overlay above cards */}
              {String(p.name || '').trim() && !String(p.name || '').startsWith('[H] Seat') && (
                <div className="absolute -top-10 left-0 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90 z-[2000] whitespace-nowrap justify-center">
                  <span>{p.name}</span>
                  {(oppRating != null) && <span className="text-amber-100/80">({oppRating})</span>}
                  {MOBILE && <span className="text-amber-200/70">к: {nHand}</span>}
                  <span className="text-amber-200/50">•</span>
                  <span className="text-amber-200/80">{pts}p</span>
                </div>
              )}

              {/* single opponent fan (coalition + hand) */}
              <div
                className={
                  "relative h-44 pointer-events-auto transition-colors rounded-2xl " +
                  (MOBILE ? (flatP5 ? "scale-[0.74] origin-top" : "scale-[0.65] origin-top") : "") +
                  ((pickTargetForAction4 || pickTargetForAction9 || pendingPersona45 || pickTargetForPersona9 || pendingP17PickOpp || (placementModeOpp && String(placementModeOpp.targetId) === String(p.id))) ? "cursor-pointer ring-2 ring-emerald-500/30 hover:ring-emerald-300/50" : "")
                }
                style={{ width: Math.max(width, 260) }}
                onClick={() => {
                  if (pendingP17PickOpp) {
                    try { moves.persona17PickOpponent(String(p.id)); } catch {}
                    return;
                  }
                  if (pendingPersona45) {
                    try { moves.persona45StealFromOpponent(String(p.id)); } catch {}
                    return;
                  }
                  if (pickTargetForPersona9) {
                    try { playSfx('play'); moves.playPersona(pickTargetForPersona9.cardId, undefined, 'right', String(p.id)); } catch {}
                    setPickTargetForPersona9(null);
                    return;
                  }
                  if (pickTargetForAction4) {
                    try { moves.playAction(pickTargetForAction4.cardId, String(p.id)); } catch {}
                    setPickTargetForAction4(null);
                    return;
                  }
                  if (pickTargetForAction9) {
                    try { moves.playAction(pickTargetForAction9.cardId, String(p.id)); } catch {}
                    setPickTargetForAction9(null);
                    return;
                  }

                }}
                onPointerMove={(e) => {
                  if (flatP5) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX ?? 0) - rect.left;
                  // Note: opponent fan has variable spacing; use proportional index for hover.
                  let idx = Math.max(0, Math.min(show - 1, Math.floor((x / Math.max(1, width)) * show)));
                  const shown = oppFanCards.slice(0, show);
                  // Ignore facedown backs completely (no hover effect)
                  if (shown[idx]?.kind === 'back') {
                    setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null }));
                    return;
                  }
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: idx }));
                }}
                onPointerEnter={() => {
                  if (flatP5) return;
                  const shown = oppFanCards.slice(0, show);
                  const firstFace = shown.findIndex((it) => it.kind === 'face');
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: firstFace >= 0 ? firstFace : null }));
                }}
                onPointerLeave={() => { if (!flatP5) setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null })); }}
                title={`Total: ${nTotal}`}
              >
                {/* count hidden on mobile (was overlapping) */}
                {!MOBILE && nTotal > 0 && (
                  <div className="absolute -top-15 left-1/2 -translate-x-1/2 bg-black/70 border border-black/40 text-amber-100 font-mono font-black text-[12px] px-2 py-0.5 rounded-full">{nTotal}</div>
                )}

                {oppFanCards.slice(0, show).map((it, i) => {
                  const t = show <= 1 ? 0.5 : i / (show - 1);
                  const rot = flatP5 ? 0 : (t - 0.5) * 12;

                  // variable spacing: backs tighter, faces looser
                  const shown = oppFanCards.slice(0, show);
                  let left = 0;
                  for (let k = 0; k < i; k++) {
                    left += (shown[k + 1]?.kind === 'back') ? stepBack : stepFace;
                  }

                  const dist = (hoverIdx == null) ? 99 : Math.abs(i - hoverIdx);
                  const isBack = it.kind === 'back';
                  const scale = (flatP5 || hoverIdx == null) ? 1 : (isBack ? 1 : scaleByDist2(dist));
                  const z = (hoverIdx == null) ? i : (1000 - dist);

                  const imgRaw = it.kind === 'back' ? '/assets/backing.jpg' : it.card.img;
                  const img = (typeof imgRaw === 'string' && imgRaw.endsWith('.jpg')) ? imgRaw.slice(0, -4) + '.webp' : imgRaw;
                  const id = it.kind === 'back' ? 'back' : it.card.id;
                  const oppPlaceActive = !!placementModeOpp && String(placementModeOpp.targetId) === String(p.id);
                  const canClickFaceForOppPlace = oppPlaceActive && it.kind === 'face' && it.card?.type === 'persona';

                  const canClickFaceForP8Swap = canPersona8Swap && it.kind === 'face' && String(it.card?.id) === String(p8SwapSpec?.playedPersonaId) && String(p.id) === String(p8SwapSpec?.ownerId);

                  // persona picks (no modal)
                  const canClickFaceForP21 = pendingP21 && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);
                  const canClickFaceForP26 = pendingP26 && it.kind === 'face' && it.card?.type === 'persona' && Array.isArray(it.card?.tags) && it.card.tags.includes('faction:red_nationalist') && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP28 = pendingP28 && it.kind === 'face' && it.card?.type === 'persona' && !(Array.isArray(it.card?.tags) && it.card.tags.includes('faction:fbk')) && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP37 = pendingP37 && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP3A = G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && it.kind === 'face' && it.card?.type === 'persona' && Array.isArray(it.card?.tags) && it.card.tags.includes('faction:leftwing') && !it.card?.shielded && !isImmovablePersona(it.card);
                  const pendingP3Choice = G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId);
                  const pendingA7 = G.pending?.kind === 'action_7_block_persona' && String(playerID) === String(G.pending.attackerId);
                  const canClickFaceForA7 = pendingA7 && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);

                  const pendingA13 = G.pending?.kind === 'action_13_shield_persona' && String(playerID) === String(G.pending.attackerId);
                  const canClickFaceForA13 = pendingA13 && String(p.id) === String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);
                  const canClickFaceForP7 = pendingP7 && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);
                  const canClickFaceForP14 = pending?.kind === 'discard_one_persona_from_any_coalition' && String(pending?.playerId) === String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP11 = pendingP11Pick && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP13 = pendingP13 && String(p.id) === String(pendingP13AttackerId) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP5 = G.pending?.kind === 'persona_5_pick_liberal' && String(playerID) === String(G.pending.playerId) && String(p.id) !== String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card) && Array.isArray(it.card?.tags) && it.card.tags.includes('faction:liberal');

                  const pendingA17 = G.pending?.kind === 'action_17_choose_opponent_persona' && String(playerID) === String(G.pending.attackerId);
                  const canClickFaceForA17 = pendingA17 && String(p.id) !== String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);

                  const canClickFace = canClickFaceForOppPlace || canClickFaceForP8Swap || canClickFaceForP21 || canClickFaceForP26 || canClickFaceForP28 || canClickFaceForP37 || canClickFaceForP3A || canClickFaceForA7 || canClickFaceForA13 || canClickFaceForP7 || canClickFaceForP14 || canClickFaceForP11 || canClickFaceForP13 || canClickFaceForP5 || canClickFaceForA17;
                  return (
                    <div
                      key={`${p.id}-${i}-${id}`}
                      className={"absolute bottom-[20px] w-40 aspect-[2/3] rounded-2xl overflow-visible border border-black/40 shadow-2xl " + (canClickFace ? "cursor-pointer ring-2 ring-emerald-400/40" : "")}
                      style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'center center' }}
                      title={id}
                      onClick={(e) => {
                        if (!canClickFace) return;
                        if (canClickFaceForP8Swap) {
                          try { playSfx('ui', 0.35); moves.persona8SwapWithPlayedPersona(); } catch {}
                          return;
                        }
                        if (canClickFaceForOppPlace) {
                          // Click left/right half of card to place before/after it.
                          try {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const side = (x < rect.width / 2) ? 'left' : 'right';
                            playSfx('play');
                            moves.playPersona(placementModeOpp.cardId, it.card.id, side, placementModeOpp.targetId);
                          } catch {}
                          setPlacementModeOpp(null);
                          return;
                        }
                        if (canClickFaceForP21) {
                          try { playSfx('ui', 0.35); moves.persona21InvertTokens(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP26) {
                          try { playSfx('ui', 0.35); moves.persona26PurgeRedNationalist(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP28) {
                          try { playSfx('ui', 0.35); moves.persona28StealPlusTokens(String(p.id), it.card.id, 3); } catch {}
                          return;
                        }
                        if (canClickFaceForP37) {
                          try { playSfx('ui', 0.35); moves.persona37BribeAndSilence(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP3A) {
                          try { playSfx('ui', 0.35); moves.persona3ChooseOption('a', String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (pendingP3Choice) {
                          // Option B: click any opponent card to apply the global token-removal effect.
                          try { playSfx('ui', 0.35); moves.persona3ChooseOption('b'); } catch {}
                          return;
                        }
                        if (canClickFaceForA7) {
                          try { playSfx('ui', 0.35); moves.blockPersonaForAction7(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForA13) {
                          try { playSfx('ui', 0.35); moves.shieldPersonaForAction13(it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP7) {
                          if (!p7FirstPick) {
                            setP7FirstPick({ ownerId: String(p.id), cardId: it.card.id });
                            return;
                          }
                          if (String(p7FirstPick.ownerId) !== String(p.id)) return;
                          if (String(p7FirstPick.cardId) === String(it.card.id)) return;
                          try { playSfx('ui', 0.35); moves.persona7SwapTwoInCoalition(String(p.id), p7FirstPick.cardId, it.card.id); } catch {}
                          setP7FirstPick(null);
                          return;
                        }
                        if (canClickFaceForP14) {
                          try { playSfx('ui', 0.35); moves.discardPersonaFromCoalition(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP11) {
                          try { playSfx('ui', 0.35); moves.persona11DiscardOpponentPersona(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForP13) {
                          try { playSfx('ui', 0.35); moves.persona13PickTarget(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (MOBILE) {
                          try { setMobileOppZoomPid(String(p.id)); } catch {}
                        }
                        if (canClickFaceForP5) {
                          try { playSfx('ui', 0.35); moves.persona5PickLiberal(String(p.id), it.card.id); } catch {}
                          return;
                        }
                        if (canClickFaceForA17) {
                          try { playSfx('ui', 0.35); moves.applyAction17ToPersona(it.card.id); } catch {}
                          return;
                        }
                      }}
                    >
                      {it.kind === 'face' && String(it.card?.shieldedBy || '') === 'action_13' && (
                        <img
                          src={'/cards/action_13.webp'}
                          alt={'action_13'}
                          className="absolute z-30 pointer-events-none select-none opacity-95"
                          style={{
                            width: '50%',
                            aspectRatio: '2 / 3',
                            right: '6%',
                            top: '-6%',
                            transform: 'rotate(-18deg)',
                          }}
                          draggable={false}
                        />
                      )}
                      <img src={img} alt={id} className="relative z-10 w-full h-full object-cover" draggable={false} />
                      {(it.kind === 'face' && Number(it.card?.vpDelta || 0) !== 0) && (
                        <div className={
                          "absolute left-2 bottom-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center text-white font-black text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.6)] " +
                          (Number(it.card?.vpDelta || 0) < 0 ? "bg-red-700/95 border-red-200/50" : "bg-emerald-700/95 border-emerald-200/50")
                        }>
                          {it.card.vpDelta}
                        </div>
                      )}
                      {(it.kind === 'face' && Number(it.card?.passiveVpDelta || 0) !== 0) && (
                        <TokenPips delta={it.card.passiveVpDelta} compact right dim />
                      )}
                      {it.kind === 'face' && it.card?.blockedAbilities && (
                        <div className="absolute top-[42px] left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black z-40">
                          <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls (Citadel-style touchables) */}
      <div className="fixed inset-0 z-[1100] pointer-events-none">
        {MOBILE ? (
          <>
            {/* Mobile text buttons */}
            <div className="fixed top-3 z-[20000] pointer-events-auto select-none flex flex-col gap-2" style={{ right: 'min(12px, 1vw)', transform: 'translateX(-118px)' }}>
              <button
                type="button"
                onClick={() => { if (!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) return; playSfx('draw'); moves.drawCard(); }}
                className={
                  "px-3 py-2 rounded-xl border text-amber-100/90 font-mono font-black text-[11px] transition-colors " +
                  ((!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2)
                    ? "opacity-50 bg-black/60 border-amber-900/25"
                    : ((isMyTurn && !G.hasDrawn)
                      ? "bg-emerald-700/45 border-emerald-300/60 animate-pulse"
                      : "bg-black/60 border-amber-900/25"))
                }
                style={(isMyTurn && !G.hasDrawn && !(!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2)) ? { animationDuration: '1.8s' } : undefined}
                title="Взять карту"
                aria-disabled={!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2}
              >
                Взять карту
              </button>

              <button
                type="button"
                onClick={() => { if (!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed) return; playSfx('ui'); moves.endTurn(); }}
                className={
                  "px-3 py-2 rounded-xl bg-amber-600/90 border border-amber-500/30 text-amber-950 font-mono font-black text-[11px] " +
                  ((!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed) ? "opacity-50" : "")
                }
                title="Закончить ход"
                aria-disabled={!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed}
              >
                Закончить ход
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!MOBILE) return;
                  if (false) {
                    try {
                      const card = (me?.hand || []).find((c) => String(c.id) === String(mobileHandSelected));
                      if (!card) return;
                      const baseId = String(card.id).split('#')[0];
                      const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && card.type === 'persona';
                      const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';
                      if (canPlayPersona) {
                        const coal = me?.coalition || [];
                        if (coal.length === 0) {
                          moves.playPersona(card.id);
                        } else {
                          setPlacementMode({ cardId: card.id, neighborId: null, side: 'right' });
                        }
                      } else if (canPlayAction) {
                        moves.playAction(card.id);
                      }
                      setMobileHandSelected(null);
                    } catch {}
                    return;
                  }
                  setMobileHandOpen(!mobileHandOpen);
                  if (mobileHandOpen) setMobileHandSelected(null);
                }}
                className={
                  "px-3 py-2 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[11px] " +
                  (mobileHandOpen ? "opacity-90" : "")
                }
                title="Рука"
              >
                Рука
              </button>
              {MOBILE && opponents.length > 1 && (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const ids = opponents.map((o) => String(o.id));
                      const cur = String(mobileOppFocus || ids[0]);
                      const i = Math.max(0, ids.indexOf(cur));
                      const next = ids[(i + 1) % ids.length];
                      setMobileOppFocus(String(next));
                    }}
                    className="px-3 py-1 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[10px]"
                    title="Следующий соперник"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = opponents.map((o) => String(o.id));
                      const cur = String(mobileOppFocus || ids[0]);
                      const i = Math.max(0, ids.indexOf(cur));
                      const prev = ids[(i - 1 + ids.length) % ids.length];
                      setMobileOppFocus(String(prev));
                    }}
                    className="px-3 py-1 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[10px]"
                    title="Предыдущий соперник"
                  >
                    ◀
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Desktop: use fixed text buttons (avoid resolution-dependent deck image placement) */}
            <div className="fixed top-3 z-[20000] pointer-events-auto select-none flex flex-col gap-2" style={{ right: 'min(16px, 1vw)' }}>
              <button
                type="button"
                onClick={() => { if (!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed) return; playSfx('ui'); moves.endTurn(); }}
                className={
                  "px-4 py-2 rounded-xl bg-amber-600/90 border border-amber-500/30 text-amber-950 font-mono font-black text-[12px] shadow-lg " +
                  ((!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed) ? "opacity-50" : "")
                }
                title="Закончить ход"
                aria-disabled={!isMyTurn || G.pending || !G.hasDrawn || !G.hasPlayed}
              >
                Закончить ход
              </button>

              <button
                type="button"
                onClick={() => { if (!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) return; playSfx('draw'); moves.drawCard(); }}
                className={
                  "px-4 py-2 rounded-xl border text-amber-100/90 font-mono font-black text-[12px] transition-colors shadow-lg " +
                  ((!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2)
                    ? "opacity-50 bg-black/60 border-amber-900/25"
                    : ((isMyTurn && !G.hasDrawn)
                      ? "bg-emerald-700/45 border-emerald-300/60 animate-pulse"
                      : "bg-black/60 border-amber-900/25"))
                }
                style={(isMyTurn && !G.hasDrawn && !(!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2)) ? { animationDuration: '1.8s' } : undefined}
                title="Взять карту"
                aria-disabled={!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2}
              >
                Взять карту
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pending banner */}
      {pendingTokens && pendingTokensRemaining > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingTokensSource || 'EVENT'}: {pendingTokensSingleTarget ? 'choose ONE persona, then place all +1 on it' : 'place +1 tokens on your coalition'} — click a coalition card ({pendingTokensRemaining} left)
          </div>
        </div>
      )}

      {pendingP11Offer && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-auto select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-2xl px-4 py-2 text-amber-100/90 font-mono text-[12px] flex items-center gap-3">
            <span>Соловьёв: использовать способность или пропустить? (блокирует добор)</span>
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-emerald-700/70 border border-emerald-300/30 hover:bg-emerald-700/90"
              onClick={() => { try { playSfx('ui', 0.35); moves.persona11Use(); } catch {} }}
            >
              Use
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-zinc-700/70 border border-zinc-300/20 hover:bg-zinc-700/90"
              onClick={() => { try { playSfx('ui', 0.25); moves.persona11Skip(); } catch {} }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-auto select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-2xl px-4 py-2 text-amber-100/90 font-mono text-[12px] flex items-center gap-3">
            <span>SVTV: click leftwing persona to discard (A) OR click any opponent card for -tokens (B)</span>
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-zinc-700/70 border border-zinc-300/20 hover:bg-zinc-700/90"
              onClick={() => { try { playSfx('ui', 0.25); moves.persona3Skip(); } catch {} }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {pendingP21 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP21Source}: click any persona on the table to invert its tokens
          </div>
        </div>
      )}

      {pendingP26 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP26Source}: click a red_nationalist persona to discard + inherit its +1
          </div>
        </div>
      )}

      {pendingP28 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP28Source}: click a non-FBK persona to steal up to 3 × +1 (auto)
          </div>
        </div>
      )}

      {pendingP23 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP23Source}: тап по Волкову — минус 1 и добор (до 3). Esc — закончить.
          </div>
        </div>
      )}

      {pendingP32 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] flex items-center gap-2">
            <span>{pendingP32Source}: click a persona in YOUR coalition to return it to hand</span>
            <button
              type="button"
              className="ml-2 px-3 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700/70 border border-amber-900/20 text-amber-50 font-black text-[11px]"
              onClick={() => { try { moves.persona32CancelBounce(); } catch {} }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingP37 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP37Source}: click an opponent persona to bribe (+2) and block abilities
          </div>
        </div>
      )}

      {pendingP13 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] pointer-events-auto">
            p13 ({pendingP13Source}): кликни по персоне атакующего чтобы дать -1 · Esc пропустить
          </div>
        </div>
      )}

      {pendingP33 && (
        <div className="fixed inset-0 z-[6000] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/70 border border-amber-900/30 rounded-2xl px-5 py-3 text-amber-100/90 font-mono text-[12px] shadow-2xl pointer-events-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="opacity-80">{pendingP33Source}:</span> choose faction
                <span className="ml-3 text-amber-200/70">(1..7)</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {[
                ['1', 'liberal', 'faction:liberal'],
                ['2', 'right', 'faction:rightwing'],
                ['3', 'left', 'faction:leftwing'],
                ['4', 'fbk', 'faction:fbk'],
                ['5', 'red', 'faction:red_nationalist'],
                ['6', 'system', 'faction:system'],
                ['7', 'neutral', 'faction:neutral'],
              ].map(([k, label, tag]) => (
                <button
                  key={k}
                  type="button"
                  className="px-3 py-1 rounded-full bg-amber-600/80 hover:bg-amber-500/80 border border-amber-200/20 text-amber-950 font-black text-[11px] pointer-events-auto"
                  onClick={() => { try { moves.persona33ChooseFaction(tag); } catch {} }}
                  title={`(${k})`}
                >
                  {k} · {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingP34 && (() => {
        const remaining = p34Remaining || [];
        const wheelCount = remaining.length;
        const wheelId = remaining[p34WheelIdx] || '';
        const onWheel = (e) => {
          if (!wheelCount) return;
          try { e.preventDefault(); } catch {}
          const dir = e.deltaY > 0 ? 1 : -1;
          setP34WheelIdx((i) => (i + dir + wheelCount) % wheelCount);
          playSfx('fan', 0.35);
        };

        return (
          <div className="fixed inset-0 z-[6000] pointer-events-auto select-none bg-black/40 backdrop-blur-sm">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1100px,95vw)] max-h-[90vh] overflow-auto bg-transparent border-0 rounded-2xl px-5 py-4 text-amber-100/90">
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-[12px]">
                  <span className="opacity-80">{pendingP34Source}:</span> Милов — выбери персонажа (следующая персона в колоде, события/действия пропускаются)
                </div>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700/70 border border-amber-900/20 text-amber-50 font-black text-[11px]"
                  onClick={() => { try { moves.persona34GuessTopdeck('skip'); } catch {} }}
                >
                  Skip
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div className="relative w-[440px] max-w-[90vw]">
                  <img src="/assets/ui/milov.webp" alt="Milov" className="w-full h-auto block opacity-95" draggable={false} />
                  <div
                    className="absolute left-[12%] right-[12%] top-[22%] h-[28%] rounded-lg bg-black/70 border border-amber-400/40 flex items-center justify-center text-[12px] font-mono text-amber-100/90 px-2 cursor-pointer"
                    onWheel={onWheel}
                    onClick={() => { try { if (wheelId) moves.persona34GuessTopdeck(wheelId); } catch {} }}
                    title={wheelId ? personaName(wheelId) : 'wheel'}
                  >
                    {wheelId ? personaName(wheelId) : '—'}
                  </div>
                </div>
                <div className="text-[11px] opacity-80">Колесо мыши: листай варианты. Клик по окошку — подтвердить.</div>
              </div>

              <div className="mt-3 text-amber-200/60 text-[10px] font-mono text-center">
                (исключены: сыгранные/в сбросе + те, что у тебя в руке)
              </div>
            </div>
          </div>
        );
      })()}

            {pendingP16 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9600] pointer-events-none select-none">
          <div className="bg-black/60 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            Сбросьте 3 карты ({(p16DiscardPick || []).length}/3)
          </div>
        </div>
      )}

      {pendingHandLimit && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9600] pointer-events-none select-none">
          <div className="bg-black/60 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            Сбросьте лишние карты ({(me?.hand || []).length} / 7)
          </div>
        </div>
      )}

      {/* Targeting prompt (action_4) */}
      {((!!pickTargetForAction4) || (!!pickTargetForAction9)) && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">{pickTargetForAction4 ? 'Action 4' : 'Action 9'}</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {pickTargetForAction4
                ? `Pick an opponent. They will discard 1 coalition card of their choice.\nClick their hand. (Esc to cancel)`
                : `Pick an opponent. Discard 1 persona from their coalition.\nClick their hand. (Esc to cancel)`}
            </div>
          </div>
        </div>
      )}

      {/* Response window UI */}
      {responseActive && responseKey !== skippedResponseKey && String(response?.playedBy) !== String(playerID) && (
        (responseKind === 'cancel_action' && (haveAction6 || canPersona10Cancel || (haveAction14 && responseTargetsMe))) ||
        (responseKind === 'cancel_persona' && haveAction8)
      ) && (
        <div className="fixed inset-0 z-[6000] pointer-events-none select-none">
          {/* cancel_action stays as a compact pill */}
          {responseKind === 'cancel_action' && (
            <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/70 border border-amber-900/30 rounded-full px-5 py-3 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-4 pointer-events-auto">
              <div className="flex items-center gap-3">
                <div>
                  {haveAction6 && 'Action played — respond with Action 6 to cancel'}
                  {!haveAction6 && haveAction14 && responseTargetsMe && 'You are targeted — respond with Action 14 to cancel the effect'}
                  {(!haveAction6 && canPersona10Cancel) && 'Вы можете позвать маму Наки чтобы отменить действие'}
                  <span className="ml-3 text-amber-200/70">{responseSecondsLeft}s</span>
                </div>
                {haveAction6 && (() => {
                  const c6 = (me?.hand || []).find((c) => c?.type === 'action' && String(c.id).split('#')[0] === 'action_6');
                  if (!c6) return null;
                  return (
                    <button type="button" onClick={() => { try { moves.playAction(c6.id); } catch {} }} className="px-3 py-1 rounded-full bg-emerald-700/60 hover:bg-emerald-600/70 border border-emerald-200/20 text-emerald-50 font-black text-[11px]">
                      Play A6
                    </button>
                  );
                })()}
                {canPersona10Cancel && (
                  <button type="button" onClick={() => { try { moves.persona10CancelFromCoalition(); } catch {} }} className="px-3 py-1 rounded-full bg-fuchsia-700/50 hover:bg-fuchsia-600/60 border border-fuchsia-200/20 text-fuchsia-50 font-black text-[11px]">
                    p10 cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* cancel_persona (Action 8): response window UI. Always show SKIP (actor may need it too). */}
          {responseKind === 'cancel_persona' && (() => {
            const c8 = (me?.hand || []).find((c) => c?.type === 'action' && String(c.id).split('#')[0] === 'action_8') || null;
            return (
              <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-6 pointer-events-auto">
                {c8 && (
                  <>
                    <button
                      type="button"
                      className="px-4 py-1.5 rounded-xl bg-emerald-700/60 hover:bg-emerald-600/70 border border-emerald-200/20 text-emerald-50 font-black text-[12px] shadow-2xl"
                      onClick={() => { try { moves.playAction(c8.id); } catch {} }}
                      title="(1)"
                    >
                      USE ABILITY
                    </button>

                    <div className="w-48 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
                      <img src={c8.img} alt={c8.id} className="w-full h-full object-cover" draggable={false} />
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/70 border border-amber-900/20 text-amber-50 font-black text-[12px] shadow-2xl"
                  onClick={() => {
                    try {
                      setSkippedResponseKey(responseKey);
                      window.localStorage.setItem(`politikum.skipResponse:${responseKey}`, String(Date.now()));
                    } catch {}
                    try { moves.skipResponseWindow(); } catch {}
                  }}
                  title="(2)"
                >
                  SKIP
                </button>

                {canPersona8Swap && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl bg-purple-800/50 hover:bg-purple-700/60 border border-purple-200/20 text-purple-50 font-black text-[12px] shadow-2xl"
                    onClick={() => { try { moves.persona8SwapWithPlayedPersona(); } catch {} }}
                    title="(3)"
                  >
                    p8 swap
                  </button>
                )}

                <div className="absolute left-1/2 top-[-28px] -translate-x-1/2 text-amber-200/70 font-mono text-[12px]">
                  Action 8 response window · {responseSecondsLeft}s
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Mobile: cancel local targeting modes */}
      {MOBILE && (placementMode || placementModeOpp || pickTargetForAction4 || pickTargetForAction9 || pickTargetForPersona9 || (p7FirstPick != null)) && (
        <div className="fixed top-3 right-3 z-[6000] pointer-events-auto select-none">
          <button
            type="button"
            onClick={mobileCancelTargeting}
            className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[11px]"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Tutorial: simple center-board text (toggle T) */}
      {showTutorial && (
        <div className="fixed inset-0 z-[3200] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Tutorial (T)</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre">
              {`1) Draw: C (or click deck)\n2) Play: click a card (or 1..9, 0=10)\n3) End: E (or click cookies)\n\nL toggles logs · H toggles hint badges`}
            </div>
          </div>
        </div>
      )}

      {/* Action_4 / Action_9 discard prompt (target chooses) */}
      {(G.pending?.kind === 'action_4_discard' || G.pending?.kind === 'action_9_discard_persona') && String(playerID) === String(G.pending.targetId) && !(responseActive && responseKind === 'cancel_action' && haveAction14 && responseTargetsMe) && (
        <div className="fixed inset-0 z-[3199] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/55 border border-amber-900/20 rounded-2xl px-5 py-4 backdrop-blur-sm shadow-2xl">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Выбор сброса</div>
            <div className="mt-2 text-amber-100/85 text-sm font-mono whitespace-pre text-center">
              {G.pending?.kind === 'action_9_discard_persona'
                ? 'Кликни по ПЕРСОНЕ в своей коалиции, чтобы сбросить её.'
                : 'Кликни по карте в своей коалиции, чтобы сбросить её.'}
            </div>
          </div>
        </div>
      )}

      {/* Event_12b: each affected player discards 1 card from hand */}
      {G.pending?.kind === 'event_12b_discard_from_hand' && Array.isArray(G.pending.targetIds) && G.pending.targetIds.includes(String(playerID)) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-transparent pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from hand</div>
            <div className="mt-2 text-amber-100/80 text-sm">EVENT {G.pending.sourceCardId}: choose 1 card from your hand to discard.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.hand || []).map((c) => (
                <button
                  key={c.id}
                  className="w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.discardFromHandForEvent12b(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(me?.hand || []).length && (
                <div className="text-amber-200/70 text-sm">You have no cards to discard.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hand limit: discard down to 7 (no modal) */}
      {G.pending?.kind === 'discard_down_to_7' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            У тебя больше 7 карт: сбрось лишние кликом по картам на руке
          </div>
        </div>
      )}

      {/* Persona prompts (no modals) */}
      {G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            SVTV (p3): click a LEFTWING persona to discard it, or press B for option B
          </div>
        </div>
      )}

      {pendingP12 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Savin (p12): click one adjacent red_nationalist to get +2
          </div>
        </div>
      )}

            {pendingP7 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>
              p7: {p7FirstPick ? 'pick SECOND persona (same coalition)' : 'pick FIRST persona'}
            </span>
            {p7FirstPick && (
              <button
                type="button"
                className="pointer-events-auto px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60"
                onClick={() => setP7FirstPick(null)}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Persona_5 target prompt */}
      {G.pending?.kind === 'persona_5_pick_liberal' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            p5: click a LIBERAL persona in an opponent’s coalition
          </div>
        </div>
      )}

      {/* Persona_14 discard prompt (no modal) */}
      {G.pending?.kind === 'discard_one_persona_from_any_coalition' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            p14: click any persona on the table to discard it
          </div>
        </div>
      )}

      {/* Persona_11 (Solovei): no top pill (use card glow/scale instead) */}

      {/* Persona_17 pick opponent */}
      {pendingP17PickOpp && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            p17: click an opponent to reveal their hand and steal 1 persona
          </div>
        </div>
      )}

      {/* Persona_17 pick persona from revealed hand */}
      {pendingP17PickCard && (() => {
        const target = (G.players || []).find((pp) => String(pp.id) === String(pendingP17TargetId));
        const cards = (target?.hand || []).filter((c) => c?.type === 'persona');
        return (
          <div className="fixed inset-x-0 top-14 z-[9600] flex items-start justify-center pointer-events-none select-none">
            <div className="pointer-events-auto bg-black/75 border border-amber-900/30 rounded-3xl shadow-2xl p-4 max-w-[96vw]">
              <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">p17: pick a persona from {target?.name || pendingP17TargetId}</div>
              <div className="mt-3 flex gap-3 flex-wrap justify-center">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-emerald-400/40 hover:border-emerald-300 cursor-pointer shadow-2xl hover:scale-[1.02] transition-transform"
                    onClick={() => { try { moves.persona17StealPersonaFromHand(c.id); } catch {} }}
                    title={c.name || c.id}
                  >
                    <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                  </button>
                ))}
                {!cards.length && (
                  <div className="text-amber-200/70 text-sm">No personas in hand.</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Persona_45: choose opponent (no modal) */}
      {pendingPersona45 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            {pendingPersona45Source}: click an opponent to steal 1 random card
          </div>
        </div>
      )}

      {canPersona8Swap && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            persona_8: click the just-played persona to SWAP with it
          </div>
        </div>
      )}

      {canPersona10Cancel && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Вы можете позвать маму Наки чтобы отменить действие
          </div>
        </div>
      )}

      {/* Event_16: discard one of YOUR personas, then draw 1 (no modal) */}
      {G.pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            EVENT {G.pending.sourceCardId}: click a persona in YOUR coalition to discard it (then draw 1)
          </div>
        </div>
      )}

      {/* Action_7: click a persona on the table to block (no modal) */}
      {G.pending?.kind === 'action_7_block_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Экшен 7: ткни по любой персоне на столе чтобы запретить ей способности
          </div>
        </div>
      )}

      {/* Action_13: shield one of YOUR personas (no modal) */}
      {G.pending?.kind === 'action_13_shield_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Белое пальто: ткни по персоне в СВОЕЙ коалиции чтобы защитить
          </div>
        </div>
      )}

      {/* Action_17: click any opponent persona on the table (no modal) */}
      {G.pending?.kind === 'action_17_choose_opponent_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Action 17: ткни по персоне любого оппонента (Esc чтобы отменить)
          </div>
        </div>
      )}

      {/* Action_18: return persona from discard to hand */}
      {G.pending?.kind === 'action_18_pick_persona_from_discard' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-transparent backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 18 — Return from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose a persona from the discard pile to return to your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                <button
                  key={c.id}
                  className="w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.pickPersonaFromDiscardForAction18(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(G.discard || []).some((c) => c.type === 'persona' && !isImmovablePersona(c)) && (
                <div className="text-amber-200/70 text-sm">No personas in discard.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persona_20: take any card from discard to hand */}
      {G.pending?.kind === 'persona_20_pick_from_discard' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-transparent backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Bykov (p20) — Take from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose 1 ACTION card from the discard pile to take into your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).filter((c) => c.type === 'action').map((c) => (
                <button
                  key={c.id}
                  className="w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.persona20PickFromDiscard(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
              {!(G.discard || []).length && (
                <div className="text-amber-200/70 text-sm">No cards in discard.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {G.gameOver && (
        <div
          className="fixed inset-0 z-[3000] flex items-start justify-center bg-black/65 backdrop-blur-sm pointer-events-auto overflow-y-auto py-12"
        >
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[3100] pointer-events-auto">
            <button
              type="button"
              onClick={async () => {
                const m = String(matchID || '').match(/^t_([^_]+)_(\d+)_/);
                const tid = m ? m[1] : null;
                const tableId = m ? m[2] : null;
                if (tid && tableId) {
                  try {
                    await fetch(`${SERVER}/public/tournament/${tid}/table/${tableId}/sync_result`, { method: 'POST' });
                  } catch {}
                  try { window.location.hash = `#/tournament/${tid}`; } catch {}
                } else {
                  // Leave match state (client-side). Also clear persisted last match so reload doesn't re-open gameover.
                  try {
                    window.localStorage.removeItem('politikum.lastMatchID');
                    window.localStorage.removeItem('politikum.lastPlayerID');
                    window.localStorage.removeItem('politikum.lastCredentials');
                  } catch {}
                  try { window.location.hash = ''; } catch {}
                  try { window.location.reload(); } catch {}
                }
              }}
              className="px-4 py-2 rounded-full bg-black/60 border border-amber-900/30 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
              title={String(matchID || '').startsWith('t_') ? 'Назад в турнир' : 'Назад в лобби'}
            >
              {String(matchID || '').startsWith('t_') ? 'Назад в турнир' : 'Назад в лобби'}
            </button>
          </div>
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-6 w-[1100px] max-w-[96vw] relative max-h-[90vh] overflow-y-auto">
            {/* hitbox debug removed */}
            <button
              type="button"
              onClick={() => setGoShowAllDetails((v) => !v)}
              className="absolute top-4 right-4 z-[3200] px-3 py-2 rounded-xl bg-black/50 hover:bg-black/65 border border-amber-900/25 text-amber-100 font-mono font-black text-[11px]"
              title="Показать детали расчёта"
            >
              Детали
            </button>
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black text-center">КОНЕЦ ИГРЫ</div>
            {(() => {
              const active = (G.players || [])
                .filter((p) => !!p?.active)
                .filter((p) => {
                  const n = String(p?.name || '').trim();
                  if (!n) return false;
                  if (n.startsWith('[H] Seat')) return false;
                  return true;
                });
              const scoreNow = (p) => (p?.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
              const scores = active.map((p) => ({ id: String(p.id), name: String(p.name || p.id), score: scoreNow(p) }));
              const best = Math.max(...scores.map((x) => x.score), -Infinity);
              const winners = scores.filter((x) => x.score === best);
              const isTie = winners.length >= 2;
              const label = isTie ? 'Победила ДРУЖБА!' : 'Победитель';
              const names = winners.map((x) => x.name).join(' · ');
              return (
                <div className="mt-2 text-amber-100 font-serif text-2xl font-bold text-center">
                  {label} {names}
                </div>
              );
            })()}
            {Array.isArray(G.history) && G.history.length >= 2 && (() => {
              const hist = G.history;
              // Use the same ordering for legend + chart: sort by final score DESC.
              const colors = ['#f59e0b', '#22c55e', '#60a5fa', '#f472b6', '#a78bfa'];
              const scoreNow = (pid) => {
                const p = (G.players || []).find((pp) => String(pp.id) === String(pid));
                return (p?.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
              };
              const playerIds = (G.players || [])
                .filter((p) => !!p?.active)
                .filter((p) => {
                  const n = String(p?.name || '').trim();
                  if (!n) return false;
                  if (n.startsWith('[H] Seat')) return false;
                  return true;
                })
                .map((p) => String(p.id))
                .sort((a, b) => scoreNow(b) - scoreNow(a));

              const leftIds = playerIds.slice(0, Math.ceil(playerIds.length / 2));
              const rightIds = playerIds.slice(Math.ceil(playerIds.length / 2));

              const Fan = ({ pid, color }) => {
                const p = (G.players || []).find((pp) => String(pp.id) === String(pid));
                const coal = (p?.coalition || []).filter((c) => c.type === 'persona');
                const show = Math.min(12, coal.length);
                const stepFace = 40;
                const width = 140 + Math.max(0, (show - 1)) * stepFace;
                const hoverIdx = hoverOppCoalition?.[`go-${pid}`] ?? null;

                const scaleByDist2 = (_dist) => 1; // no zoom on win screen

                return (
                  <div className="flex flex-col items-center gap-2 relative pt-10 pointer-events-auto">
                    <div className="absolute -top-10 left-0 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest z-[2000] whitespace-nowrap justify-center" style={{ color }}>
                      <span>{p?.name || pid}</span>
                      <span className="opacity-50">•</span>
                      <span>{scoreNow(pid)} очк</span>
                    </div>
                    <div
                      className="relative h-52 pointer-events-none select-none"
                      style={{ width: Math.max(width, 260) }}
                      // no hover-zoom on win screen
                    >
                      {coal.slice(0, show).map((c, i) => {
                        const t = show <= 1 ? 0.5 : i / (show - 1);
                        const rot = (t - 0.5) * 12;
                        const left = i * stepFace;
                        const dist = (hoverIdx == null) ? 99 : Math.abs(i - hoverIdx);
                        const scale = (hoverIdx == null) ? 1 : scaleByDist2(dist);
                        const z = (hoverIdx == null) ? i : (1000 - dist);
                        return (
                          <div
                            key={c.id}
                            className="absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl pointer-events-none"
                            style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'center center' }}
                          >
                            <img src={c.img} alt={c.id} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                            {(Number(c.vpDelta || 0) !== 0) && (
                              <div className={
                                "absolute left-2 bottom-2 w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] " +
                                (Number(c.vpDelta || 0) < 0 ? "bg-red-700/90 border-red-200/30" : "bg-emerald-700/90 border-emerald-200/30")
                              }>
                                {c.vpDelta}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Per-player details section (toggled by top-right button) */}
                    {goShowAllDetails && (
                      <div className="w-full max-w-[520px] px-1">
                        <div className="mt-1 space-y-0.5 text-[10px] font-mono text-amber-100/70">
                          {coal.map((c) => {
                            const base = Number(c.baseVp ?? 0);
                            const tok = Number(c.vpDelta || 0);
                            const pas = Number(c.passiveVpDelta || 0);
                            const total = Number(c.vp ?? (base + tok + pas));
                            return (
                              <div key={c.id} className="flex items-baseline justify-between gap-3">
                                <span className="truncate">{String(c.name || c.id)}</span>
                                <span className="shrink-0 tabular-nums">
                                  {base}{tok ? ` ${tok > 0 ? '+' : ''}${tok}` : ''}{pas ? ` ${pas > 0 ? '+' : ''}${pas}` : ''} = {total}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* per-player details button removed */}
                  </div>
                );
              };

              return (
                <>
                  {/* Score history chart (turn vs VP) */}
                  {(() => {
                    const turns = hist.map((h) => Number(h.turn || 0));
                    const minT = Math.min(...turns);
                    const maxT = Math.max(...turns);

                    const allScores = hist.flatMap((h) => playerIds.map((pid) => Number(h.scores?.[pid] ?? 0)));
                    const minY = Math.min(0, ...allScores);
                    const maxY = Math.max(1, ...allScores);

                    const W = 460, H = 160, pad = 18;
                    const sx = (t) => pad + ((t - minT) / Math.max(1, (maxT - minT))) * (W - pad * 2);
                    const sy = (v) => (H - pad) - ((v - minY) / Math.max(1, (maxY - minY))) * (H - pad * 2);

                    const pathFor = (pid) => {
                      const pts = hist.map((h) => ({ x: sx(Number(h.turn || 0)), y: sy(Number(h.scores?.[pid] ?? 0)) }));
                      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                    };

                    return (
                      <div className="mt-4">
                        <div className="text-amber-200/60 text-[10px] uppercase tracking-[0.3em] font-black text-center">История успеха</div>
                        <svg width={W} height={H} className="mt-2 mx-auto block rounded-xl bg-black/25 border border-amber-900/20">
                          {/* axes */}
                          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />
                          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />

                          {/* axis labels */}
                          <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="rgba(251,191,36,0.55)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">ход</text>
                          <text x={6} y={H / 2} textAnchor="middle" fontSize={9} fill="rgba(251,191,36,0.55)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" transform={`rotate(-90 6 ${H / 2})`}>очки</text>

                          {/* ticks */}
                          {(() => {
                            const ticksY = 4;
                            const out = [];
                            for (let i = 0; i <= ticksY; i++) {
                              const v = minY + ((maxY - minY) * i) / ticksY;
                              const y = sy(v);
                              out.push(
                                <g key={`y-${i}`}>
                                  <line x1={pad - 4} y1={y} x2={pad} y2={y} stroke="rgba(251,191,36,0.25)" />
                                  <text x={pad - 7} y={y + 3} textAnchor="end" fontSize={9} fill="rgba(251,191,36,0.55)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">{Math.round(v)}</text>
                                </g>
                              );
                            }
                            const ticksX = Math.min(6, Math.max(1, maxT - minT));
                            for (let i = 0; i <= ticksX; i++) {
                              const t = minT + Math.round(((maxT - minT) * i) / ticksX);
                              const x = sx(t);
                              out.push(
                                <g key={`x-${i}`}>
                                  <line x1={x} y1={H - pad} x2={x} y2={H - pad + 4} stroke="rgba(251,191,36,0.25)" />
                                  <text x={x} y={H - pad + 14} textAnchor="middle" fontSize={9} fill="rgba(251,191,36,0.55)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">{t}</text>
                                </g>
                              );
                            }
                            return out;
                          })()}

                          {playerIds.map((pid, i) => (
                            <path key={pid} d={pathFor(pid)} fill="none" stroke={colors[i % colors.length]} strokeWidth={2.5} opacity={0.95} />
                          ))}
                        </svg>
                      </div>
                    );
                  })()}

                  {/* Final coalitions: single bottom row */}
                  <div className="mt-6 flex justify-evenly gap-6 items-end flex-wrap">
                    {playerIds.map((pid, i) => (
                      <Fan key={pid} pid={pid} color={colors[i % colors.length]} />
                    ))}
                  </div>

                  {/* Global details removed: now rendered under each player */}
                </>
              );
            })()}

            {/* fallback if no history */}
            {(!Array.isArray(G.history) || G.history.length < 2) && (
              <div className="mt-4 text-amber-100/80 text-sm font-mono whitespace-pre">
                {(G.players || [])
                  .filter((p) => !!p?.active)
                  .filter((p) => {
                    const n = String(p?.name || '').trim();
                    if (!n) return false;
                    if (n.startsWith('[H] Seat')) return false;
                    return true;
                  })
                  .map((p) => {
                    const pts = (p.coalition || []).reduce((s, c) => s + Number(c.vp || 0), 0);
                    return `${p.name}: ${pts} очк (коалиция ${(p.coalition || []).length})`;
                  }).join('\n')}
              </div>
            )}

            {/* (removed) */}
          </div>
        </div>
      )}

      {/* Event card: big centered while resolving */}
      {ENABLE_EVENT_SPLASH && showEventSplash && !!G.lastEvent && !MOBILE && (
        <div className="fixed inset-0 z-[9500] pointer-events-none select-none">
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center">
            <div className="mb-3 text-amber-100/90 font-black text-2xl drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)]">Ой!</div>
            <div className="w-64 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
              <img src={G.lastEvent.img} alt={G.lastEvent.id} className="w-full h-full object-cover" draggable={false} />
            </div>
          </div>
        </div>
      )}

      {/* Action splash (auto-hide) */}
      {ENABLE_ACTION_SPLASH && showActionSplash && !!G.lastAction && (
        <div className="fixed inset-0 z-[9600] pointer-events-none">
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 flex items-end gap-6">
            <div className="w-56 aspect-[2/3] rounded-3xl overflow-hidden border border-black/50 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
              <img src={G.lastAction.img} alt={G.lastAction.id} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="max-w-[360px]">
              <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action</div>
              <div className="mt-2 text-amber-100 font-serif text-xl font-bold">{G.lastAction.id}</div>
              <div className="mt-2 text-amber-100/70 text-sm">(MVP) Actions discard on play; effects later.</div>
            </div>
          </div>
        </div>
      )}

      {/* Log (collapsible) */}
      {MOBILE && (
        <div className="fixed top-3 z-[20000] pointer-events-auto select-none flex items-center gap-2" style={{ left: 'min(12px, 1vw)', transform: 'translateX(18px)' }}>
          <button
            type="button"
            onClick={() => setLogCollapsed((v) => !v)}
            className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[11px]"
            title="Toggle log"
          >
            {logCollapsed ? 'LOG' : 'LOG ×'}
          </button>
          <div className="px-3 py-2 rounded-xl bg-black/60 border border-amber-900/25 text-amber-100/90 font-mono font-black text-[11px]">VP: {myCoalitionPoints}</div>
        </div>
      )}
      {!logCollapsed && (
      <div className={
        "fixed top-[calc(50%-80px)] -translate-y-1/2 left-4 z-[950] pointer-events-auto transition-transform duration-300 ease-out " +
        (logCollapsed ? "translate-x-[-392px]" : "translate-x-0")
      }>
        <div className="w-[420px] bg-black/55 backdrop-blur-md border border-amber-900/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-900/10">
            <div className="text-[10px] uppercase tracking-widest text-amber-200/70 font-black">Chronicles</div>

            <div className="ml-auto flex items-center gap-2">
              {!logCollapsed && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      try { playSfx('ui', 0.4); } catch {}
                      try { localStorage.removeItem("politikum.lastMatchId"); } catch {}
                      try { localStorage.removeItem("politikum.lastMatchId:admin"); } catch {}
                      try { localStorage.removeItem("politikum.lastMatchId:public"); } catch {}
                      try { window.location.hash = "#/"; } catch {}
                    }}
                    className="px-2 py-0.5 rounded-md border border-red-500/40 bg-red-600/80 text-red-50 text-[10px] font-black"
                    title="Quit"
                  >
                    Quit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTutorial((v) => !v)}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (showTutorial ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Tutorial (T)"
                  >
                    T
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHotkeys((v) => !v)}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (showHotkeys ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Hotkeys (H)"
                  >
                    H
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSoundOn((v) => {
                        const nv = !v;
                        try { localStorage.setItem('politikum:soundOn', nv ? '1' : '0'); } catch {}
                        return nv;
                      });
                      playSfx('ui', 0.4);
                    }}
                    className={("px-2 py-0.5 rounded-md border text-[10px] font-black transition-colors " + (soundOn ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-100" : "bg-black/20 border-amber-900/20 text-amber-200/70 hover:text-amber-200"))}
                    title="Sound (M)"
                  >
                    M
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setLogCollapsed((v) => !v)}
                className="px-2 py-0.5 rounded-md border border-amber-900/20 bg-black/20 text-amber-200/70 hover:text-amber-200 text-[12px] font-black"
                title="Toggle log (L)"
              >
                {logCollapsed ? ">" : "<"}
              </button>
            </div>
          </div>
          <div ref={logRef} className="px-3 py-3 font-mono text-[12px] whitespace-pre-wrap text-amber-100/80 max-h-[168px] overflow-y-auto custom-scrollbar">
            {(G.log || []).slice(-40).join("\n")}
          </div>
        </div>
      </div>
      )}

      {/* My coalition (built row fan) */}
      <div className={"fixed -ml-[100px] z-[5000] pointer-events-auto transition-all " + (G.gameOver ? "opacity-0 pointer-events-none blur-sm" : "opacity-100")}
        style={(() => {
          const dx = 'calc(min(50px, 6vw) + min(50px, 6vw))'; // +50 more right
          const dy = 'min(50px, 6vh) + min(100px, 12vh)'; // +100 more down
          if (MOBILE) {
            return {
              left: '50%',
              bottom: `calc(24px + env(safe-area-inset-bottom, 0px))`,
              transform: `translateX(-50%) translateY(calc(${mobileOppZoomPid ? dy + ' + 120vh' : dy} + ${mobileHandOpen ? '30px' : '0px'}))`,
            };
          }
          return { left: '50%', bottom: '1.5rem', transform: 'translateX(calc(-50% - 300px))' };
        })()}>

        {(() => {
          const coal = (me?.coalition || []);
          const n = Math.max(1, coal.length);
          const step = Math.min(54, Math.max(24, 320 / Math.max(1, n - 1)));
          const width = 160 + (n - 1) * step;

          const scaleByDist3 = (dist) => {
            if (dist === 0) return 2.0;
            if (dist === 1) return 1.35;
            if (dist === 2) return 1.15;
            return 1;
          };

          return (
            <div
              className="relative h-64 overflow-visible"
              style={{ width }}
              onMouseMove={(e) => {
                if (!coal.length) return;
                if (pendingP28) return; // disable hover-zoom during persona_28 targeting (hitboxes must be stable)
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                // smoother: use card center thresholds instead of rounding
                const idx = Math.max(0, Math.min(coal.length - 1, Math.floor((x + step / 2) / step)));
                setHoverMyCoalition(idx);
              }}
              onMouseLeave={() => { if (!pendingP28) setHoverMyCoalition(null); }}
            >
              {coal.map((c, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const rot = (t - 0.5) * 12;
                const left = i * step;

                const dist = hoverMyCoalition == null ? 99 : Math.abs(i - hoverMyCoalition);
                const z = hoverMyCoalition == null ? i : (1000 - dist);

                const pendingEvent16 = pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(pending?.playerId) === String(playerID);
                const pendingA4A9Discard = (pending?.kind === 'action_4_discard' || pending?.kind === 'action_9_discard_persona') && String(pending?.targetId) === String(playerID);
                const pendingA13Here = pending?.kind === 'action_13_shield_persona' && String(pending?.attackerId) === String(playerID) && c.type === 'persona' && !isImmovablePersona(c);
                const pendingP21Here = pendingP21;
                const pendingP23Here = pendingP23;
                const pendingP26Here = pendingP26;
                const pendingP28Here = pendingP28;
                const pendingP32Here = pendingP32;
                const pendingP12Here = pendingP12 && (String(c.id) === pendingP12Left || String(c.id) === pendingP12Right);
                const pendingP7Here = pendingP7 && c.type === 'persona' && !isImmovablePersona(c);
                const canUseP39Here = canUseP39 && String(c.id).split('#')[0] === 'persona_39';
                const pendingP14Here = pending?.kind === 'discard_one_persona_from_any_coalition' && String(pending?.playerId) === String(playerID) && c.type === 'persona' && !c.shielded && !isImmovablePersona(c);

                const isP11 = String(c.id).split('#')[0] === 'persona_11';
                const canUseP11 = pendingP11Offer && isP11;
                const finalScale = pendingP28Here ? 1 : ((hoverMyCoalition == null ? 1 : scaleByDist3(dist)) * (canUseP11 ? 1.2 : 1));

                return (
                  <button
                    type="button"
                    key={c.id}
                    className={
                      "absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-visible border-2 shadow-2xl transition-colors " +
                      (canUseP11
                        ? "border-emerald-300/80 ring-4 ring-emerald-400/25 shadow-[0_0_50px_rgba(16,185,129,0.35)] cursor-pointer"
                        : (placementMode || pendingTokens || pendingEvent16 || pendingA4A9Discard || pendingA13Here || pendingP21Here || pendingP26Here || pendingP28Here || pendingP32Here || pendingP12Here || pendingP7Here || canUseP39Here || pendingP14Here
                          ? (canUseP39Here
                            ? "border-emerald-300/80 hover:border-emerald-200 cursor-pointer ring-4 ring-emerald-400/25 shadow-[0_0_45px_rgba(16,185,129,0.28)]"
                            : ((pendingP14Here || pendingA13Here) ? "border-emerald-400/60 hover:border-emerald-300 cursor-pointer" : "border-emerald-400/50 hover:border-emerald-300 cursor-pointer"))
                          : "border-black/40 cursor-default"))
                    }
                    style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${finalScale})`, transformOrigin: 'bottom center' }}
                    title={c.id}
                    onClick={(e) => {
                      if (canUseP11) {
                        try { playSfx('ui', 0.35); moves.persona11Use(); } catch {}
                        return;
                      }
                      if (placementMode) {
                        // Click left/right half of a coalition card to place before/after it.
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const side = (x < rect.width / 2) ? 'left' : 'right';
                        try { playSfx('play'); moves.playPersona(placementMode.cardId, c.id, side); } catch {}
                        setPlacementMode(null);
                        return;
                      }
                      if (pendingEvent16) {
                        try { moves.discardPersonaFromOwnCoalitionForEvent16(c.id); } catch {}
                        return;
                      }
                      if (pendingHandLimit && !mobileHandSelected && (hand || []).length) { setMobileHandSelected((hand || [])[0].id); }
                if (pendingA4A9Discard) {
                        if (pending?.kind === 'action_9_discard_persona' && c.type !== 'persona') return;
                        if (c.shielded || isImmovablePersona(c)) return;
                        try { moves.discardFromCoalition(c.id); } catch {}
                        return;
                      }
                      if (pendingP23Here && String(c.id).split('#')[0] === 'persona_23') {
                        // Tap-friendly: each tap takes 1 × (-1) and draws 1 (up to 3).
                        try { moves.persona23ChooseSelfInflict(1); } catch {}
                        return;
                      }
                      if (pendingP21Here) {
                        try { moves.persona21InvertTokens(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (pendingP26Here) {
                        // Can't pick red nationalist from own coalition usually, but allow.
                        try { moves.persona26PurgeRedNationalist(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (MOBILE && !pendingTokens && !pendingEvent16 && !pendingA4A9Discard && !pendingA13Here && !pendingP21Here && !pendingP26Here && !pendingP28Here && !pendingP32Here && !pendingP12Here && !pendingP7Here && !canUseP39Here && !pendingP14Here && !placementMode) {
                        setMobileMyZoomCard(c);
                        return;
                      }
                      if (pendingP28Here) {
                        try { moves.persona28StealPlusTokens(String(playerID), c.id, 3); } catch {}
                        return;
                      }
                      if (pendingP32Here) {
                        try { moves.persona32BounceToHand(c.id); } catch {}
                        return;
                      }
                      if (pendingP12Here) {
                        try { moves.persona12ChooseAdjacentRed(c.id); } catch {}
                        return;
                      }
                      if (canUseP39Here) {
                        try { moves.persona39ActivateRecycle(); } catch {}
                        return;
                      }
                      if (pendingP7Here) {
                        if (!p7FirstPick) {
                          setP7FirstPick({ ownerId: String(playerID), cardId: c.id });
                          return;
                        }
                        if (String(p7FirstPick.ownerId) !== String(playerID)) return;
                        if (String(p7FirstPick.cardId) === String(c.id)) return;
                        try { moves.persona7SwapTwoInCoalition(String(playerID), p7FirstPick.cardId, c.id); } catch {}
                        setP7FirstPick(null);
                        return;
                      }
                      if (pendingP14Here) {
                        try { moves.discardPersonaFromCoalition(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (pendingA13Here) {
                        try { moves.shieldPersonaForAction13(c.id); } catch {}
                        return;
                      }
                      if (!pendingTokens) return;
                      if (pendingTokensSingleTarget) {
                        const tid = pendingTokensTargetId || c.id;
                        if (!pendingTokensTargetId) setPendingTokensTargetId(tid);
                        if (String(c.id) !== String(tid)) return; // must place all tokens on the same persona
                        try { moves.applyPendingToken(tid); } catch {}
                        return;
                      }
                      try { moves.applyPendingToken(c.id); } catch {}
                    }}
                  >
                    {String(c?.shieldedBy || '') === 'action_13' && (
                      <img
                        src={'/cards/action_13.webp'}
                        alt={'action_13'}
                        className="absolute z-30 pointer-events-none select-none opacity-95"
                        style={{
                          width: '50%',
                          aspectRatio: '2 / 3',
                          right: '6%',
                          top: '-6%',
                          transform: 'rotate(-18deg)',
                        }}
                        draggable={false}
                      />
                    )}
                    <img src={c.img} alt={c.id} className="relative z-10 w-full h-full object-cover" draggable={false} />
                    {MOBILE ? (
                      <div className="absolute z-30 flex flex-col items-start gap-1" style={{ top: 30, left: 10 }}>
                        {(Number(c.vpDelta || 0) > 0) && (
                          <div className="w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.6)] bg-emerald-700/95 border-emerald-200/50">
                            +{Number(c.vpDelta || 0)}
                          </div>
                        )}
                        {(Number(c.vpDelta || 0) < 0) && (
                          <div className="w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.6)] bg-red-700/95 border-red-200/50">
                            {Number(c.vpDelta || 0)}
                          </div>
                        )}
                        {Number(c.passiveVpDelta || 0) > 0 && (
                          <TokenPipsInline count={Number(c.passiveVpDelta || 0)} />
                        )}
                        {Number(c.passiveVpDelta || 0) < 0 && (
                          <TokenPipsInline count={Math.abs(Number(c.passiveVpDelta || 0))} neg />
                        )}
                      </div>
                    ) : (
                      <>
                        {(Number(c.vpDelta || 0) !== 0) && (
                          <div className={
                            "absolute left-2 bottom-2 z-20 w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.6)] " +
                            (Number(c.vpDelta || 0) < 0 ? "bg-red-700/95 border-red-200/50" : "bg-emerald-700/95 border-emerald-200/50")
                          }>
                            {c.vpDelta}
                          </div>
                        )}
                        {(Number(c.passiveVpDelta || 0) !== 0) && (
                          <TokenPips delta={c.passiveVpDelta} right dim />
                        )}
                      </>
                    )}
                    {(c.shielded || c.blockedAbilities) && (
                      <div className="absolute top-[42px] left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black z-40">
                        {c.shielded && String(c?.shieldedBy || '') !== 'action_13' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-sky-700/90 border border-sky-300/40 text-sky-50 shadow-md">SH</span>
                        )}
                        {c.blockedAbilities && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Placement mode prompt (no modal) */}
      {!!placementMode && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>Place persona: click LEFT/RIGHT half of a coalition card to insert before/after</span>
            <button type="button" className="px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60" onClick={() => setPlacementMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!!placementModeOpp && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>Place into opponent: click LEFT/RIGHT half of their coalition card to insert</span>
            <button type="button" className="px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60" onClick={() => setPlacementModeOpp(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Total VP */}
      {!MOBILE && (
        <div className="fixed z-[9500] pointer-events-none select-none bottom-4 right-4">
          <div className="bg-black/60 border border-amber-900/20 rounded-2xl text-amber-100/90 font-mono shadow-2xl px-4 py-2">
            <div className="font-black tracking-widest text-[14px]">VP: {myCoalitionPoints}</div>
            <div className="mt-0.5 text-amber-200/60 tabular-nums text-[10px]">
              Base {myVpBase} + Tokens {myVpTokens} + Passives {myVpPassives}
            </div>
          </div>
        </div>
      )}

      {/* Mobile: opponent inspect modal */}
            {MOBILE && mobileMyZoomCard && (
        <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm pointer-events-auto flex items-center justify-center" onClick={() => setMobileMyZoomCard(null)}>
          <div className="relative w-[min(82vw,380px)] max-h-[88vh] aspect-[2/3] rounded-2xl overflow-hidden border border-amber-900/30 shadow-2xl bg-black/60" style={{ transform: 'translateY(-40px)' }}>
            <img src={mobileMyZoomCard.img} alt="zoom" className="w-full h-full object-cover" draggable={false} />
            {(Number(mobileMyZoomCard.vpDelta || 0) !== 0) && (
              <div className={
                "absolute left-2 top-2 z-20 w-8 h-8 rounded-full border flex items-center justify-center text-white font-black text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.6)] " +
                (Number(mobileMyZoomCard.vpDelta || 0) < 0 ? "bg-red-700/95 border-red-200/50" : "bg-emerald-700/95 border-emerald-200/50")
              }>
                {mobileMyZoomCard.vpDelta}
              </div>
            )}
            {(Number(mobileMyZoomCard.passiveVpDelta || 0) !== 0) && (
              <TokenPips delta={mobileMyZoomCard.passiveVpDelta} right dim top />
            )}
            {(mobileMyZoomCard.shielded || mobileMyZoomCard.blockedAbilities) && (
              <div className="absolute top-[42px] right-2 flex gap-1 text-[9px] font-mono font-black z-40">
                {mobileMyZoomCard.shielded && String(mobileMyZoomCard?.shieldedBy || '') !== 'action_13' && (
                  <span className="px-1.5 py-0.5 rounded-full bg-sky-700/90 border border-sky-300/40 text-sky-50 shadow-md">SH</span>
                )}
                {mobileMyZoomCard.blockedAbilities && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {MOBILE && mobileOppZoomPid && (() => {
        const p = (opponents || []).find((pp) => String(pp.id) === String(mobileOppZoomPid));
        if (!p) return null;
        const hand0 = p.hand || [];
        const coal = (p.coalition || []);
        const nHand = (hand0 || []).length;
        const faces = coal.map((c) => ({ kind: 'face', card: c }));
        const oppFanCards = faces;
        const show = oppFanCards.length;
        const stepFace = 44;
        const width = 160 + Math.max(0, show - 1) * stepFace;
        return (
          <div className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm pointer-events-auto flex items-center justify-center" onClick={() => setMobileOppZoomPid(null)}>
            <div className="relative">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/65 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90 z-[2000] whitespace-nowrap justify-center">
                <span>{p.name || p.id}</span>
                <span className="text-amber-200/70">к: {nHand}</span>
              </div>
              <div className="relative h-60 pointer-events-none select-none" style={{ width: Math.max(width, 260) }}>
                {oppFanCards.map((it, i) => {
                  const t = show <= 1 ? 0.5 : i / (show - 1);
                  const rot = (t - 0.5) * 12;
                  const left = i * stepFace;
                  return (
                    <div
                      key={it.card?.id || i}
                      className="absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                      style={{ left, transform: `rotate(${rot}deg)` }}
                    >
                      {it.kind === 'face' && <img src={it.card.img} alt={it.card.id} className="w-full h-full object-cover" draggable={false} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {MOBILE && mobileHandOpen && (
        <div className="fixed left-0 right-0 z-[9500] pointer-events-auto select-none" style={{ bottom: `calc(70px + env(safe-area-inset-bottom, 0px))` }}>
          <div className="mx-auto w-[min(92vw,720px)] bg-transparent border-0 px-0 py-0">
            <div className="relative h-[180px] overflow-visible">
              {(hand || []).map((card, idx) => {
                const left = idx * 56;
                const total = Math.max(0, (hand || []).length - 1) * 56 + 120;
                const offset = `calc(50% - ${total/2}px)`;
                const isSel = String(mobileHandSelected || '') === String(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="absolute top-0 w-[120px] aspect-[2/3] rounded-xl overflow-hidden border border-amber-900/30"
                    style={{ left: `calc(${offset} + ${left}px)`, zIndex: isSel ? 2000 : idx + 1, transform: isSel ? 'scale(1.04)' : 'scale(1.0)' }}
                    onClick={() => setMobileHandSelected(card.id)}
                  >
                    <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
                  </button>
                );
              })}
              {!(hand || []).length && (
                <div className="text-amber-200/40 italic text-sm font-serif">Пусто.</div>
              )}
            </div>
          </div>
        </div>
      )}

      
      {MOBILE && (pendingHandLimit || (G.pending?.kind === 'discard_down_to_7' && String(playerID) === String(G.pending.playerId))) && mobileHandOpen && (
        <div className="fixed left-3 z-[2600] pointer-events-auto select-none" style={{ bottom: `calc(150px + env(safe-area-inset-bottom, 0px))` }}>
          <button
            type="button"
            onClick={() => {
              if (!mobileHandSelected) return;
              try { moves.discardFromHandDownTo7(mobileHandSelected); } catch {}
              setMobileHandSelected(null);
            }}
            className={
              "px-6 py-3 rounded-xl font-mono font-black text-[13px] " +
              (mobileHandSelected ? "bg-red-600/90 text-red-50" : "bg-red-900/40 text-red-200/40")
            }
            aria-disabled={!mobileHandSelected}
          >
            Сбросить
          </button>
        </div>
      )}
{MOBILE && mobileHandSelected && (
        <div className="fixed inset-0 z-[9600] flex items-center justify-center pointer-events-auto">
          <div className="relative w-[min(70vw,320px)] aspect-[2/3] rounded-2xl overflow-hidden border border-amber-900/30 shadow-2xl bg-black/80">
                        <img src={(hand || []).find((c) => String(c.id) === String(mobileHandSelected))?.img} alt="zoom" className="w-full h-full object-cover" draggable={false} onClick={() => setMobileHandSelected(null)} />
          </div>
        </div>
      )}

      {/* Mobile: cancel hand selection */}

      {MOBILE && mobileHandSelected && (
        <div className="fixed left-3 z-[9600] pointer-events-auto select-none" style={{ bottom: `calc(96px + env(safe-area-inset-bottom, 0px))` }}>
          <button
            type="button"
            onClick={() => {
              try {
                const card = (hand || []).find((c) => String(c.id) === String(mobileHandSelected));
                if (!card) return;
                const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && card.type === 'persona';
                const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';
                if (pendingP16) {
                  const next = [...(p16DiscardPick || [])];
                  if (!next.includes(card.id)) next.push(card.id);
                  setP16DiscardPick(next);
                  if (next.length >= 3) {
                    try { moves.persona16Discard3FromHand(next[0], next[1], next[2]); } catch {}
                    setP16DiscardPick([]);
                  }
                  setMobileHandSelected(null);
                  return;
                }
                if (canPlayPersona) {
                  const coal = me?.coalition || [];
                  const baseId = String(card.id).split('#')[0];
                  if (baseId === 'persona_9') {
                    const opp = (G.players || []).find((pp) => String(pp.id) !== String(playerID));
                    if (opp) {
                      moves.playPersona(card.id, undefined, "right", String(opp.id));
                      setMobileHandSelected(null);
                      setMobileHandOpen(false);
                      return;
                    }
                  }
                  if (coal.length === 0) { moves.playPersona(card.id); } else { setPlacementMode({ cardId: card.id, neighborId: null, side: 'right' }); }
                  setMobileHandSelected(null);
                  setMobileHandOpen(false);
                } else if (canPlayAction) {
                  moves.playAction(card.id);
                  setMobileHandSelected(null);
                  setMobileHandOpen(false);
                } else {
                  try { playSfx('error', 0.5); } catch {}
                  return;
                }
              } catch {}
            }}
            className={(pendingP16 ? "px-6 py-3 rounded-xl bg-amber-500/90 text-amber-950" : "px-6 py-3 rounded-xl bg-emerald-600/90 text-emerald-50") + " font-mono font-black text-[13px]"}
          >
            {pendingP16 ? "Сбросить" : "Сыграть"}
          </button>
        </div>
      )}

      {/* Mobile: no hand toggle button (hand peeks from the right) */}

      {/* Hand fan */}
      {!MOBILE && (
      <div
        className={"fixed z-[999] pointer-events-auto " + (MOBILE ? "left-1/2" : "bottom-6 right-[410px]")}
        style={MOBILE ? (() => {
          // Hand peeks from the right edge; rotated -90deg. Tap any card to expand/collapse.
          const dxClosed = 'calc(100vw - 70px)'; // only tops visible
          const dxOpen = '50vw'; // centered-ish
          const y = 'calc(50vh + 20px)';
          const s = '0.85';
          return {
            left: '0px',
            top: '0px',
            transform: `translateX(${mobileHandOpen ? dxOpen : dxClosed}) translateY(${y}) rotate(90deg) scale(${s})`,
            transition: 'transform 220ms ease-out',
            transformOrigin: 'top left',
          };
        })() : undefined}
      >
        <div
          className="relative h-56 overflow-visible"
          style={{ width: `${handWidth}px`, marginLeft: 'auto' }}
          onMouseMove={(e) => {
            if (!cards.length) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const idx = Math.max(0, Math.min(cards.length - 1, Math.round(x / handStep)));
            setHoverHandIndex(idx);
          }}
          onMouseLeave={() => setHoverHandIndex(null)}
        >
          {cards.map((card, idx) => {
            const t = fanN <= 1 ? 0.5 : idx / (fanN - 1);
            const rot = (t - 0.5) * 18;
            const left = idx * handStep;

            const dist = hoverHandIndex == null ? 99 : Math.abs(idx - hoverHandIndex);
            const scale0 = hoverHandIndex == null ? 1 : scaleByDist(dist);
            const isSelected = MOBILE && String(mobileHandSelected || '') === String(card.id);
            const scale = isSelected ? Math.max(1.06, scale0) : scale0;
            const z = isSelected ? 2000 : (hoverHandIndex == null ? idx : (1000 - dist));

            const baseId = String(card.id).split('#')[0];

            const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && card.type === 'persona';
            const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';

            // out-of-turn cancels
            // Allow clicking cancels as long as server is advertising a response window.
            // Server enforces actual expiry; UI shouldn't block.
            const canCancelAction = responseKind === 'cancel_action' && card.type === 'action' && baseId === 'action_6' && String(response.playedBy) !== String(playerID);
            const canCancelPersona = responseKind === 'cancel_persona' && card.type === 'action' && baseId === 'action_8' && String(response.playedBy) !== String(playerID) && String(response?.personaCard?.id || '').split('#')[0] !== 'persona_33';
            const canCancelWithPersona10 = false; // persona_10 cancel is from coalition (not hand)

            const baseIs14 = baseId === 'action_14';
            const canCancelEffectOnMe = responseKind === 'cancel_action' && responseTargetsMe && baseIs14;

            const canDiscardDownTo7 = G.pending?.kind === 'discard_down_to_7' && String(playerID) === String(G.pending.playerId);
            const canDiscardDownTo7Mobile = pendingHandLimit; // mobile uses select+button

            const canClickP16 = pendingP16; // select cards to discard
            const canClick = canDiscardDownTo7 || canDiscardDownTo7Mobile || canClickP16 || canPlayPersona || canPlayAction || canCancelAction || canCancelPersona || canCancelEffectOnMe || canCancelWithPersona10;

            return (
              <button
                key={card.id}
                onClick={(e) => {
                  if (!canClick) return;

                  // Mobile: tap the peeking hand to expand; when expanded, first tap selects (preview), second confirms.
                  if (MOBILE && !canClickP16) {
                    if (!mobileHandOpen) {
                      try { setMobileHandOpen(true); } catch {}
                      try { playSfx('ui', 0.12); } catch {}
                      return;
                    }
                    if (String(mobileHandSelected || '') !== String(card.id)) {
                      try { playSfx('ui', 0.18); } catch {}
                      setMobileHandSelected(card.id);
                      return;
                    }
                    // second tap
                    if (pendingHandLimit) {
                      setMobileAutoDiscardId(card.id);
                      try { moves.endTurn(); } catch {}
                      return;
                    }
                    if (canDiscardDownTo7) {
                      try { playSfx('ui', 0.25); moves.discardFromHandDownTo7(card.id); } catch {}
                      setMobileHandSelected(null);
                      return;
                    }
                    setMobileHandSelected(null);
                  }

                  if (canDiscardDownTo7) {
                    try { playSfx('ui', 0.25); moves.discardFromHandDownTo7(card.id); } catch {}
                    return;
                  }
                  if (canClickP16) {
                    setP16DiscardPick((arr) => {
                      const s = new Set(arr || []);
                      if (s.has(card.id)) s.delete(card.id);
                      else s.add(card.id);
                      return Array.from(s).slice(0, 3);
                    });
                    return;
                  }
                  if (canPlayPersona) {
                    const haveCoal = (me?.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).length >= 1;

                    // persona_9: must choose opponent receiver
                    if (baseId === 'persona_9') {
                      playSfx('ui', 0.35);
                      setPickTargetForPersona9({ cardId: card.id });
                      return;
                    }

                    if (baseId === 'persona_39') {
                      playSfx('ui', 0.35);
                      try { moves.playPersona(card.id); } catch {}
                      return;
                    }

                    const POSITION_SENSITIVE = new Set(['persona_1','persona_12','persona_18','persona_19','persona_25','persona_42']);

                    // Ghost placement mode for position-sensitive personas.
                    if (haveCoal && POSITION_SENSITIVE.has(baseId)) {
                      playSfx('ui', 0.35);
                      setPlacementMode({ cardId: card.id, neighborId: null, side: 'right' });
                      return;
                    }

                    // Placement mode for any persona (legacy): Shift+click.
                    if (haveCoal && e?.shiftKey) {
                      playSfx('ui', 0.35);
                      setPlacementMode({ cardId: card.id, neighborId: null, side: 'right' });
                      return;
                    }

                    playSfx('play');
                    moves.playPersona(card.id);
                  }
                  else if (canPlayAction) {
                    if (baseId === 'action_4') { playSfx('ui', 0.35); setPickTargetForAction4({ cardId: card.id }); return; }
                    if (baseId === 'action_9') { playSfx('ui', 0.35); setPickTargetForAction9({ cardId: card.id }); return; }
                    playSfx('play');
                    moves.playAction(card.id);
                  } else if (canCancelAction || canCancelPersona || canCancelEffectOnMe) {
                    playSfx('ui', 0.35);
                    moves.playAction(card.id);
                  } else if (canCancelWithPersona10) {
                    playSfx('ui', 0.35);
                    // persona_10 cancel is from coalition; handled via overlay button
                  }
                }}
                aria-disabled={!canClick}
                className={
                  'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl border-2 transition-all duration-200 ease-out shadow-xl overflow-visible ' +
                  (canClickP16
                    ? ((p16DiscardPick || []).includes(card.id) ? 'border-emerald-300 hover:border-emerald-200 cursor-pointer ring-2 ring-emerald-400/30' : 'border-emerald-500/40 hover:border-emerald-300 cursor-pointer')
                    : (canClick
                      ? (canCancelWithPersona10
                        ? 'border-fuchsia-300/80 hover:border-fuchsia-200 cursor-pointer ring-4 ring-fuchsia-300/30 animate-pulse'
                        : ((canCancelAction || canCancelPersona) ? 'border-emerald-500/50 hover:border-emerald-300 cursor-pointer' : 'border-amber-700/40 hover:border-amber-400 cursor-pointer'))
                      : 'border-slate-900 cursor-not-allowed'))
                }
                style={{
                  left: `${left}px`,
                  zIndex: z,
                  transform: `rotate(${rot}deg) scale(${scale})`,
                  transformOrigin: 'bottom center',
                }}
                title={
                  canCancelWithPersona10
                    ? 'Вы можете позвать маму Наки чтобы отменить действие'
                    : (card.name || card.id)
                }
              >
                <div className="w-full h-full rounded-2xl overflow-hidden">
                  <img src={card.img} alt={card.id} className="w-full h-full object-cover" draggable={false} />
                </div>
                {showHotkeys && (
                  <div className="absolute left-2 -top-8 px-2 py-1 rounded-full bg-black/65 border border-amber-900/30 text-amber-100 font-mono font-black text-[11px]">
                    ({idx + 1})
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      )}

      {/* Turn status (only when hotkeys visible) */}
      {showHotkeys && (
        <div className="fixed top-[82px] left-3 z-[900] pointer-events-none select-none">
          <div className="bg-black/45 border border-amber-900/20 rounded-xl px-3 py-2 text-[10px] font-mono text-amber-200/70 whitespace-pre">
            turn: {String(ctx.currentPlayer) === String(playerID) ? 'YOU' : String(ctx.currentPlayer)}  drawn:{String(!!G.hasDrawn)}  played:{String(!!G.hasPlayed)}  event:{String(!!G.lastEvent)}{(G && G.debugLastEndTurnReject) ? `\nendTurn blocked: ${G.debugLastEndTurnReject}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function Board(props) {
  const phase = String(props?.ctx?.phase || '');

  // Expose current phase so outer shell can decide whether to rotate the whole UI on mobile.
  try { window.__POLITIKUM_PHASE__ = phase; } catch {}

  const isMobileUi = (() => {
    try {
      const sp = new URLSearchParams(String(window.location.search || ''));
      if (String(sp.get('ui') || '').trim() === 'desktop') return false;
    } catch {}
    try { return String(window.location.hash || '').startsWith('#/m'); } catch {}
    return false;
  })();

  if (phase === 'lobby') return (isMobileUi ? <MobileLobbyBoard {...props} /> : <DesktopLobbyBoard {...props} />);
  return <ActionBoard {...props} matchID={props.matchID} />;
}

const GameClient = Client({
  game: PolitikumGame,
  multiplayer: SocketIO({ server: SERVER }),
  board: Board,
  debug: false,
});

function PolitikumWelcome({ onJoin }) {
  const [matches, setMatches] = useState([]);
  const [playerName, setPlayerName] = useState(() => {
    try {
      const saved = window.localStorage.getItem('politikum.playerName');
      if (saved && String(saved).trim()) return String(saved);
    } catch {}
    const base = NAMES[Math.floor(Math.random() * NAMES.length)];
    return `[H] ${base}`;
  });
  const [top10, setTop10] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsErr, setTournamentsErr] = useState('');
  const [top10Err, setTop10Err] = useState('');
  const [loading, setLoading] = useState(false);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(true);
  const [lobbyChatErr, setLobbyChatErr] = useState('');
  const [lobbyChatInput, setLobbyChatInput] = useState('');

  const [authToken, setAuthToken] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.authToken') || ''); } catch { return ''; }
  });

  const [authRating, setAuthRating] = useState(null);

  const openProfileById = async (pid) => {
    const id = String(pid || '').trim();
    if (!id) return;
    setShowProfile(true);
    setProfileLoading(true);
    setProfileErr('');
    try {
      const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProfile(json);
    } catch (e) {
      setProfileErr(e?.message || String(e));
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Build a rating map for the whole page (chat badges etc)
        // Use public profile endpoint so it works even when leaderboard filters guests.
        const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

        const ids = uniq([
          ...((lobbyChat || []).map((m) => String(m?.playerId || '').trim())),
          (() => { try { return String(window.localStorage.getItem('politikum.sessionPlayerId') || ''); } catch { return ''; } })(),
        ]);

        const m = {};
        await Promise.all(ids.map(async (pid) => {
          if (!pid) return;
          try {
            const res = await fetch(`${SERVER}/public/profile/${encodeURIComponent(pid)}`, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            if (!json?.ok) return;
            const rating = Math.round(Number(json?.rating || 0));
            if (Number.isFinite(rating)) m[String(pid)] = rating;
          } catch {}
        }));

        setRatingsMap(m);

        if (!authToken) { setAuthRating(null); return; }
        const pid = (() => {
          try { return String(window.localStorage.getItem('politikum.sessionPlayerId') || ''); } catch { return ''; }
        })();
        if (!pid) { setAuthRating(null); return; }
        const rating = m[String(pid)] ?? null;
        if (rating == null) return;
        setAuthRating(Number(rating));
      } catch {}
    })();
  }, [authToken, lobbyChat]);

  const [betaPassword, setBetaPassword] = useState('');
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaErr, setBetaErr] = useState('');

  const doBetaLogin = async () => {
    const pw = String(betaPassword || '').trim();
    if (!pw) return;
    setBetaLoading(true);
    setBetaErr('');
    try {
      const deviceId = (() => {
        try {
          let d = window.localStorage.getItem('politikum.deviceId');
          if (!d) {
            d = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            window.localStorage.setItem('politikum.deviceId', d);
          }
          return d;
        } catch {
          return null;
        }
      })();

      const res = await fetch(`${SERVER}/auth/register_or_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(playerName || '').trim(), token: pw, deviceId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const tok = String(json?.token || '');
      const sessionPlayerId = String(json?.playerId || '');
      if (!tok) throw new Error('no_token');
      setAuthToken(tok);
      try { window.localStorage.setItem('politikum.authToken', tok); } catch {}
      if (sessionPlayerId) {
        try { window.localStorage.setItem('politikum.sessionPlayerId', sessionPlayerId); } catch {}
      }
      setBetaPassword('');
    } catch (e) {
      setBetaErr(e?.message || String(e));
    } finally {
      setBetaLoading(false);
    }
  };

  const [rightTab, setRightTab] = useState(() => {
    try { return String(window.localStorage.getItem('politikum.welcomeRightTab') || 'games'); } catch {}
    return 'top10';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);


  const refreshMatches = async () => {
    const res = await fetch(`${SERVER}/public/matches_open?limit=50`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    setMatches(json.matches || []);
  };

  useEffect(() => {
    refreshMatches().catch(() => {});
    const interval = setInterval(() => refreshMatches().catch(() => {}), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch(`${SERVER}/public/lobby_chat?limit=80`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setLobbyChat(Array.isArray(json.items) ? json.items : []);
        setLobbyChatEnabled(json.enabled !== false);
        setLobbyChatErr('');
      } catch (e) {
        if (!alive) return;
        setLobbyChatErr(e?.message || String(e));
      }
    };
    run();
    const t = setInterval(run, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const sendLobbyChat = async () => {
    const text = String(lobbyChatInput || '').trim();
    if (!text) return;
    if (!authToken) {
      alert('Chat requires beta login first (open /#/beta).');
      return;
    }
    try {
      const res = await fetch(`${SERVER}/public/lobby_chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ text, name: playerName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const err = json?.error || `HTTP ${res.status}`;
        if (err === 'rate_limited') alert('Slow down (3s).');
        else if (err === 'disabled') alert('Lobby chat disabled.');
        else alert(`Chat failed: ${err}`);
        return;
      }
      setLobbyChatInput('');
    } catch (e) {
      alert('Chat failed: ' + (e?.message || String(e)));
    }
  };


  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch(`${SERVER}/public/leaderboard?limit=10`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        const items = Array.isArray(json.items) ? json.items : [];
        const clean = items.filter((r) => {
          const n = String(r?.name || '').trim();
          if (!n) return false;
          if (n.startsWith('[H] Seat')) return false;
          return true;
        });
        setTop10(clean);
        setTop10Err('');
      } catch (e) {
        if (!alive) return;
        setTop10Err(e?.message || String(e));
      }
    };
    run();
    const t = setInterval(run, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch(`${SERVER}/public/tournaments?includeFinished=0`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setTournaments(Array.isArray(json.items) ? json.items : []);
        setTournamentsErr('');
      } catch (e) {
        if (!alive) return;
        setTournamentsErr(e?.message || String(e));
      }
    };
    run();
    const t = setInterval(run, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);


  useEffect(() => {
    try { window.localStorage.setItem('politikum.playerName', playerName); } catch {}
  }, [playerName]);

  const createMatch = async () => {
    if (!playerName) return alert('Enter your name first!');
    setLoading(true);
    try {
      const { matchID } = await lobbyClient.createMatch('politikum', {
        numPlayers: 5,
        setupData: { hostName: playerName },
      });
      setTimeout(() => joinMatch(matchID), 250);
    } catch (e) {
      // Better error: usually means the :8001 server is unreachable from this browser.
      try {
        const r = await fetch(`${SERVER}/games/politikum`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch {
        alert(`createMatch failed: cannot reach server ${SERVER}\n\nOpen this URL in the same browser to verify:\n${SERVER}/games/politikum`);
        setLoading(false);
        return;
      }
      alert('createMatch failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  const joinMatch = async (matchID) => {
    if (!playerName) return alert('Enter your name first!');
    setLoading(true);
    try {
      const response = await lobbyClient.getMatch('politikum', matchID);
      const match = response.match || response;
      if (!match || !match.players) throw new Error('Match not found');

      const seats = Array.isArray(match.players) ? match.players : Object.values(match.players || {});

      // seat selection:
      // 1) if match has reserved seats with stable playerId, take your reserved seat
      // 2) else: first empty seat
      let sessionPlayerId = '';
      try { sessionPlayerId = String(window.localStorage.getItem('politikum.sessionPlayerId') || '').trim(); } catch {}
      const reservedSeat = sessionPlayerId
        ? seats.find((p) => String(p?.data?.playerId || '') === sessionPlayerId)
        : null;
      const freeSeat = reservedSeat || seats.find((p) => !p.name && !p.isConnected);
      if (!freeSeat) {
        alert('Match is full!');
        setLoading(false);
        return;
      }

      const { playerCredentials } = await lobbyClient.joinMatch('politikum', matchID, {
        playerID: String(freeSeat.id),
        playerName,
      });

      window.localStorage.setItem('politikum.playerName', playerName);
      onJoin({ matchID, playerID: String(freeSeat.id), credentials: playerCredentials });
      setLoading(false);
    } catch (e) {
      alert('Join failed: ' + (e?.message || String(e)));
      setLoading(false);
    }
  };

  useEffect(() => {
    let mid = '';
    try { mid = String(window.localStorage.getItem('politikum.prejoinMatchId') || ''); } catch {}
    mid = String(mid || '').trim();
    if (!mid) return;
    try { window.localStorage.removeItem('politikum.prejoinMatchId'); } catch {}
    joinMatch(mid).catch(() => {});
  }, []);

  const [showWhereAmI, setShowWhereAmI] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profile, setProfile] = useState(null);
  const [ratingsMap, setRatingsMap] = useState(() => ({}));

  const MOBILE = (() => {
    try {
      const sp = new URLSearchParams(String(window.location.search || ''));
      if (String(sp.get('ui') || '').trim() === 'desktop') return false;
    } catch {}
    return String(window.location.hash || '').startsWith('#/m');
  })();

  // “prelobby / hosted / gamescreen” — first two screens are a straight copy of Citadel layout.
  return (
    <div
      className={
        "h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat flex " +
        (MOBILE ? "flex-col overflow-auto" : "flex-row overflow-hidden")
      }
      style={{ backgroundImage: "url('/assets/lobby_bg.webp')" }}
    >
      {showWhereAmI && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(1100px,95vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Что я? Где я?</div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhereAmI(false)}
                className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
              >
                Закрыть (Esc)
              </button>
            </div>

            <div className="mt-4">
              <img
                src="/assets/ui/tutorial.webp"
                alt="Tutorial"
                className="w-full rounded-xl border border-amber-900/20 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
                draggable={false}
              />
            </div>

            {/* tutorial text removed (already on image) */}
          </div>
        </div>
      )}

      {showProfile && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(520px,92vw)] max-h-[92vh] overflow-auto rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-amber-100 font-black text-sm">Профиль</div>
                <div className="text-amber-200/70 font-mono text-[12px] mt-1">Доступен всем</div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
              >
                Закрыть
              </button>
            </div>

            {profileLoading && (
              <div className="mt-4 text-amber-200/80 font-mono text-[12px]">loading…</div>
            )}
            {!profileLoading && profileErr && (
              <div className="mt-4 text-red-200/90 font-mono text-[12px]">{profileErr}</div>
            )}
            {!profileLoading && !profileErr && profile?.ok && (
              <div className="mt-4 text-amber-100/90 font-mono text-[12px] space-y-2">
                <div className="flex items-center gap-4">
                  <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden border border-amber-900/20 bg-black/30">
                    <img
                      src={`/public/profile_image/${encodeURIComponent(String(profile.playerId || ''))}.jpg`}
                      onError={(e) => { try { e.currentTarget.src = `/cards/persona_${1 + ((Number(String(profile.playerId || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0)) || 0) % 45)}.webp`; } catch {} }}
                      className="w-full h-full object-cover"
                      alt="avatar"
                      draggable={false}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div><span className="text-amber-200/70">PlayerId:</span> {String(profile.playerId || '')}</div>
                      <a
                        className="px-3 py-2 rounded-xl bg-black/45 hover:bg-black/55 border border-amber-900/20 text-amber-50 font-black text-[10px] uppercase tracking-widest"
                        href={`/profile/${encodeURIComponent(String(profile.playerId || ''))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть публичный профиль
                      </a>
                    </div>
                <div><span className="text-amber-200/70">Имя:</span> {String(profile.name || profile.username || '—')}</div>
                <div><span className="text-amber-200/70">Рейтинг:</span> {Math.round(Number(profile.rating || 0))}</div>
                <div><span className="text-amber-200/70">Игр:</span> {Number(profile.games || 0)}</div>
                <div><span className="text-amber-200/70">Побед:</span> {Number(profile.wins || 0)} ({profile.games ? Math.round((Number(profile.wins || 0) / Math.max(1, Number(profile.games || 0))) * 100) : 0}%)</div>

                {String(profile.bioText || '').trim() && (
                  <div className="mt-3 pt-3 border-t border-amber-900/20">
                    <div className="text-amber-200/70 text-[10px] uppercase tracking-[0.3em] font-black">about</div>
                    <div className="mt-2 whitespace-pre-wrap text-amber-50/85">{String(profile.bioText || '').trim()}</div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top-right links */}
      <div className="fixed top-3 right-3 z-[2000] select-none flex items-center gap-2 pointer-events-auto">
        {(() => {
          // Show ADMIN only for Konsta (avoid tempting others to guess tokens)
          const isKonsta = String(playerName || '').trim().toLowerCase() === 'konsta';
          if (!isKonsta) return null;
          return (
            <a
              href="#/admin"
              target="_blank"
              rel="noreferrer"
              className="bg-black/70 border border-amber-900/30 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/70 hover:text-amber-50"
            >
              ADMIN
            </a>
          );
        })()}
      </div>

      {/* Top bar: alias + beta login */}
      {!MOBILE && (
      <div className="fixed top-3 left-3 right-3 z-[1999] pointer-events-none">
        <button
          type="button"
          className="pointer-events-auto absolute left-0 top-0 px-3 py-2 rounded-xl bg-black/60 hover:bg-black/70 border border-amber-900/30 text-amber-100 font-black text-[10px] uppercase tracking-widest"
          onClick={() => setShowWhereAmI(true)}
          title="Что я? Где я?"
        >
          Что я? Где я?
        </button>

        <div className="pointer-events-auto max-w-3xl mx-auto flex flex-row gap-3 items-center justify-end mr-24">

          <div className="flex min-w-0 flex items-center gap-2 justify-end">
            {authToken ? (
              <>
                <div className="text-xs font-mono text-black/80 whitespace-nowrap flex items-center gap-2">
                  <span>{String(playerName || 'User').trim() || 'User'}</span>
                  {(authRating != null && !Number.isNaN(Number(authRating))) && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg bg-black/45 hover:bg-black/55 border border-amber-900/20 text-black/80"
                      title="Открыть профиль"
                      onClick={async () => {
                        const pid = String(window.localStorage.getItem('politikum.sessionPlayerId') || '').trim();
                        openProfileById(pid);
                      }}
                    >
                      {Math.round(Number(authRating))}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try { window.localStorage.removeItem('politikum.authToken'); } catch {}
                    try { window.localStorage.removeItem('politikum.sessionPlayerId'); } catch {}
                    setAuthToken('');
                    setAuthRating(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-[10px] uppercase tracking-widest"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-widest text-amber-200/60 font-black">Alias</div>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-[200px] max-w-[40vw] bg-amber-100/80 border border-amber-900/20 rounded px-3 py-2 text-black font-serif text-sm focus:outline-none focus:border-amber-500"
                  placeholder="your name"
                />

                <div className="text-[10px] uppercase tracking-widest text-amber-200/60 font-black">Token</div>
                <input
                  value={betaPassword}
                  onChange={(e) => setBetaPassword(e.target.value)}
                  type="password"
                  placeholder="token"
                  className="w-[200px] max-w-[40vw] bg-amber-100/80 border border-amber-900/20 rounded px-3 py-2 text-black font-mono text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={doBetaLogin}
                  disabled={betaLoading || !String(betaPassword || '').trim()}
                  className="px-3 py-2 rounded bg-emerald-700/80 hover:bg-emerald-600/90 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest"
                >
                  {betaLoading ? '…' : 'Login'}
                </button>
                <div className="hidden md:block text-[10px] font-mono text-black/70 whitespace-nowrap">
                  Not logged in{betaErr ? ` · ${betaErr}` : ''}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      )}

      {/* Mobile login (2 lines) */}
      {MOBILE && !authToken && (
        <div className="w-full px-3 pt-3">
          <div className="max-w-xl mx-auto bg-black/55 border border-amber-900/20 rounded-2xl p-3">
            <div className="grid gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-amber-100/85 border border-amber-900/20 rounded-xl px-3 py-3 text-black font-serif text-sm focus:outline-none"
                placeholder="Логин"
              />
              <input
                value={betaPassword}
                onChange={(e) => setBetaPassword(e.target.value)}
                type="password"
                className="w-full bg-amber-100/85 border border-amber-900/20 rounded-xl px-3 py-3 text-black font-mono text-sm focus:outline-none"
                placeholder="Токен"
              />
              <button
                type="button"
                onClick={doBetaLogin}
                disabled={betaLoading || !String(betaPassword || '').trim()}
                className="w-full py-3 rounded-xl bg-emerald-700/80 hover:bg-emerald-600/90 disabled:opacity-60 text-emerald-50 font-black text-xs uppercase tracking-widest"
              >
                {betaLoading ? '…' : 'Войти'}
              </button>
              {!!betaErr && <div className="text-[11px] font-mono text-red-200/80">{betaErr}</div>}
            </div>
          </div>
        </div>
      )}

      <div className={"bg-transparent flex items-center justify-center w-full " + (MOBILE ? "p-3 pt-5" : "p-8 pt-28") }>
        <div className={"flex items-start w-full mx-auto " + (MOBILE ? "flex-col gap-4 max-w-xl" : "flex-row gap-8 max-w-7xl px-4 max-h-[85vh]")}>
          {/* LEFT: NEWS + CHAT */}
          <div className="flex-1 min-w-0 space-y-6">
            {!MOBILE && <NewsPanel />}

            {!MOBILE && (
            <div className={"bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl flex flex-col " + (MOBILE ? "h-[56vh]" : "h-[460px] max-h-[60vh]")}>
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-500/70 font-black">TAVERN BANTER</div>
              <div className="mt-3 flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2 min-h-0">
                {!lobbyChatEnabled && (
                  <div className="bg-red-950/35 border border-red-900/40 rounded-2xl px-4 py-3">
                    <div className="text-[10px] font-mono text-red-200/70">System</div>
                    <div className="text-sm font-serif text-red-50/90">Lobby chat is disabled by admin.</div>
                  </div>
                )}
                {!!lobbyChatErr && (
                  <div className="bg-black/35 border border-amber-900/20 rounded-2xl px-4 py-3">
                    <div className="text-[10px] font-mono text-amber-200/50">System</div>
                    <div className="text-sm font-serif text-amber-50/80">Chat error: {lobbyChatErr}</div>
                  </div>
                )}
                {(lobbyChat || []).map((m, idx) => {
                  const isMe = String(m?.name || '') === String(playerName || '');
                  return (
                    <div
                      key={m.id ?? idx}
                      className={
                        isMe
                          ? 'px-1 py-1'
                          : 'bg-black/35 border border-amber-900/20 rounded-2xl px-4 py-3'
                      }
                    >
                      <div className="text-[10px] font-mono text-amber-200/50 flex items-center gap-2">
                        <span
                          className={m?.playerId ? 'cursor-pointer hover:text-amber-100' : ''}
                          onClick={() => { if (m?.playerId) openProfileById(m.playerId); }}
                        >
                          {m.name || m.playerId || 'Anon'}
                        </span>
                        {(m?.playerId && (ratingsMap[String(m.playerId)] != null)) && (
                          <button
                            type="button"
                            className="px-2 py-0.5 rounded-lg bg-black/35 hover:bg-black/45 border border-amber-900/20 text-amber-100/80 font-black"
                            title="Открыть профиль"
                            onClick={() => openProfileById(m.playerId)}
                          >
                            {ratingsMap[String(m.playerId)]}
                          </button>
                        )}
                      </div>
                      <div className="text-sm font-serif text-amber-50/90 whitespace-pre-wrap">{m.text}</div>
                    </div>
                  );
                })}
                {(!(lobbyChat || []).length && !lobbyChatErr) && (
                  <div className="bg-black/35 border border-amber-900/20 rounded-2xl px-4 py-3">
                    <div className="text-[10px] font-mono text-amber-200/50">System</div>
                    <div className="text-sm font-serif text-amber-50/80">Say hi.</div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  value={lobbyChatInput}
                  onChange={(e) => setLobbyChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLobbyChat(); } }}
                  placeholder={authToken ? (lobbyChatEnabled ? 'Напиши что-нибудь…' : 'Чат выключен') : 'Войди в /#/beta чтобы писать…'}
                  disabled={!authToken || !lobbyChatEnabled}
                  className="flex-1 bg-black/40 border border-amber-900/30 rounded-lg px-3 py-2 text-amber-200 font-serif text-sm focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={sendLobbyChat}
                  disabled={!authToken || !lobbyChatEnabled || !String(lobbyChatInput||'').trim()}
                  className="flex-none px-4 py-2 bg-amber-600 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all disabled:opacity-60 hover:bg-amber-500"
                >
                  Отправить
                </button>
              </div>
            </div>
          )}
          </div>

          {/* RIGHT: MODULES */}
          <div className={"max-w-full space-y-6 " + (MOBILE ? "w-full" : "w-[360px]")}>
            <div className="bg-black/75 backdrop-blur-xl p-8 rounded-3xl border border-amber-900/40 shadow-2xl flex flex-col h-fit">
              <h2 className="text-xl font-serif text-amber-500 font-bold mb-4 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">Список игр</h2>

              {/* Tabs */}
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRightTab('games')}
                  className={
                    'flex-1 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ' +
                    (rightTab === 'games'
                      ? 'bg-amber-600 text-amber-950 border-amber-500/40'
                      : 'bg-black/40 text-amber-200/70 border-amber-900/30 hover:bg-black/50')
                  }
                >
                  Игры
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('top10')}
                  className={
                    'flex-1 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ' +
                    (rightTab === 'top10'
                      ? 'bg-amber-600 text-amber-950 border-amber-500/40'
                      : 'bg-black/40 text-amber-200/70 border-amber-900/30 hover:bg-black/50')
                  }
                >
                  ТОП-10
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('tournaments')}
                  className={
                    'flex-1 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ' +
                    (rightTab === 'tournaments'
                      ? 'bg-amber-600 text-amber-950 border-amber-500/40'
                      : 'bg-black/40 text-amber-200/70 border-amber-900/30 hover:bg-black/50')
                  }
                >
                  Турниры
                </button>
              </div>

              {/* Tab content */}
              {rightTab === 'top10' && (
                <div className="space-y-2">
                  {(top10 && top10.length > 0) ? (
                    top10.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-amber-900/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-mono text-amber-200/50 w-7">#{i + 1}</span>
                          <button
                            type="button"
                            className="font-serif text-amber-100 text-sm font-bold truncate hover:opacity-90 text-left"
                            onClick={() => { const pid = String(r?.playerId || r?.player_id || '').trim(); if (pid) openProfileById(pid); }}
                            disabled={!String(r?.playerId || r?.player_id || '').trim()}
                            title={String(r?.playerId || r?.player_id || '').trim() ? 'Открыть профиль' : ''}
                          >
                            {r.name}
                          </button>
                        </div>
                        <div className="flex items-baseline gap-3 font-mono tabular-nums">
                          <span className="text-[12px] text-amber-200/75">G:{Number(r.games ?? 0) || 0}</span>
                          <span className="text-[12px] text-amber-200/75">W:{Number(r.wins ?? 0) || 0}</span>
                          <span className="text-[12px] text-amber-100/95 font-black">R:{Number(r.rating ?? 0) || 0}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] font-mono text-amber-200/30">{top10Err ? `Top10 unavailable: ${top10Err}` : '—'}</div>
                  )}
                </div>
              )}

              {rightTab === 'tournaments' && (
                <div className="space-y-2">
                  {tournamentsErr && <div className="text-[10px] font-mono text-amber-200/30">{tournamentsErr}</div>}
                  {(tournaments || []).slice(0, 10).map((t) => (
                    <button key={t.id} type="button" onClick={() => { window.location.hash = `#/tournament/${t.id}`; }} className="w-full text-left bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3 hover:bg-black/50">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-black text-amber-50">{t.name || t.id}</div>
                        <div className="text-[10px] font-mono text-amber-200/60">{t.status}</div>
                      </div>
                      <div className="mt-1 text-xs font-mono text-amber-200/60">{t.type} · table {t.tableSize} · players {t.playersCount}{(t.config?.maxPlayers ? `/${t.config.maxPlayers}` : '')}</div>
                    </button>
                  ))}
                  {(!(tournaments || []).length && !tournamentsErr) && (
                    <div className="text-[10px] font-mono text-amber-200/30">No open tournaments.</div>
                  )}
                </div>
              )}

              {rightTab === 'games' && (
                <>
                  <div className="overflow-y-auto space-y-2 max-h-64 mb-5 pr-1 custom-scrollbar">
                    <h3 className="text-[10px] uppercase tracking-widest text-amber-900/60 mb-2 border-b border-amber-900/10 pb-1">Доступные игры</h3>
                    {(matches || [])
                      .filter((match) => {
                        if (match.gameover) return false;
                        const seats = Array.isArray(match.players)
                          ? match.players
                          : Object.values(match.players || {});
                        return seats.some((p) => p && p.name == null);
                      })
                      .map((match) => {
                        const host = match.setupData?.hostName || 'Noble';
                        const displayName = host.endsWith('s') ? `${host}' Realm` : `${host}'s Realm`;
                        return (
                          <div key={match.matchID} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-amber-900/20 hover:bg-slate-900/80 transition-colors">
                            <div className="flex flex-col">
                              <span className="font-serif text-amber-100 text-sm font-bold">{displayName}</span>
                              <span className="text-[8px] text-amber-900/60 font-mono">ID: {match.matchID.slice(0, 4)}</span>
                            </div>
                            <button onClick={() => joinMatch(match.matchID)} className="text-amber-600 hover:text-amber-400 font-black text-xs uppercase">
                              [Join]
                            </button>
                          </div>
                        );
                      })}
                    {(!matches || matches.length === 0) && <div className="text-center py-8 text-amber-900/40 italic text-sm font-serif">Ждём игры…</div>}
                  </div>

                  <button onClick={createMatch} disabled={loading} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-60">
                    Начать игру
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpineUI() {
  useEffect(() => {
    try { document.title = 'Politikum'; } catch {}
    // Nginx likely serves SPA directly for /m, so enforce hash-route on client.
    // Also: auto-redirect mobile devices to /m (unless already there).
    try {
      const p = String(window.location.pathname || '');
      const h = String(window.location.hash || '');

      const urlParams = (() => { try { return new URLSearchParams(String(window.location.search || '')); } catch { return new URLSearchParams(''); } })();
      const forceUi = String(urlParams.get('ui') || '').trim(); // 'desktop' | 'mobile'
      try {
        if (forceUi === 'desktop') window.localStorage.setItem('politikum.forceUi', 'desktop');
        if (forceUi === 'mobile') window.localStorage.setItem('politikum.forceUi', 'mobile');
      } catch {}
      const forcedUi = (() => { try { return String(window.localStorage.getItem('politikum.forceUi') || ''); } catch { return ''; } })();

      const isAdminMobile = h.startsWith('#/adminm');

      const isMobileDevice = (() => {
        if (forcedUi === 'desktop') return false;
        if (forcedUi === 'mobile') return true;
        try {
          const ua = String(navigator.userAgent || '');
          // Prefer UA over pointer: coarse triggers on some touch laptops.
          if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
        } catch {}
        try {
          if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        } catch {}
        return false;
      })();

      // Force desktop override: leave /m + #/m routes.
      if (forcedUi === 'desktop') {
        if (h.startsWith('#/m')) {
          window.location.hash = '';
          return;
        }
        if (p === '/m' || p.startsWith('/m/')) {
          window.location.href = '/?ui=desktop';
          return;
        }
      }

      if (p === '/desk' || p.startsWith('/desk/')) {
        try { window.localStorage.setItem('politikum.forceUi', 'desktop'); } catch {}
        if (h.startsWith('#/m')) { window.location.hash = ''; }
        return;
      }

      if (p === '/m' || p.startsWith('/m/')) {
        if (!h.startsWith('#/m') && !isAdminMobile) window.location.hash = '#/m';
        return;
      }

      if (isMobileDevice && !h.startsWith('#/m') && !isAdminMobile) {
        // Keep mobile users on the mobile UI route.
        window.location.href = '/m';
        return;
      }
    } catch {}
  }, []);

  const [matchID, setMatchID] = useState(() => {
    try { return window.localStorage.getItem('politikum.lastMatchID') || null; } catch {}
    return null;
  });
  const [playerID, setPlayerID] = useState(() => {
    try { return window.localStorage.getItem('politikum.lastPlayerID') || null; } catch {}
    return null;
  });
  const [credentials, setCredentials] = useState(() => {
    try {
      const raw = window.localStorage.getItem('politikum.lastCredentials');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [hash, setHash] = useState(() => window.location.hash || '');
  const isMobileRoute = String(hash || '').startsWith('#/m');
  const [showRotateHint, setShowRotateHint] = useState(false);
  // Default false so lobby never flashes rotated while we detect phase.
  const [mobileRotateGame, setMobileRotateGame] = useState(false);

  useEffect(() => {
    if (!isMobileRoute) { if (showRotateHint) setShowRotateHint(false); return; }
    try {
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      if (!isTouch) { if (showRotateHint) setShowRotateHint(false); return; }
    } catch {}
    const check = () => {
      try {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        // Treat landscape as "rotate hint".
        setShowRotateHint(w > h);
      } catch {}
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileRoute]);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Mobile: rotate the *game table* into landscape, but keep the lobby portrait.
  useEffect(() => {
    if (!isMobileRoute) { setMobileRotateGame(false); return; }
    const tick = () => {
      try {
        const ph = String(window.__POLITIKUM_PHASE__ || '').trim();
        setMobileRotateGame(!!(ph && ph !== 'lobby'));
      } catch {}
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [isMobileRoute]);

  // Let inner UI know if the whole game is currently rotated.
  useEffect(() => {
    try { window.__POLITIKUM_ROTATED__ = !!(isMobileRoute && mobileRotateGame); } catch {}
  }, [isMobileRoute, mobileRotateGame]);

  const forgetMatch = () => {
    try {
      window.localStorage.removeItem('politikum.lastMatchID');
      window.localStorage.removeItem('politikum.lastPlayerID');
      window.localStorage.removeItem('politikum.lastCredentials');
    } catch {}
    try { setMatchID(null); } catch {}
    try { setPlayerID(null); } catch {}
    try { setCredentials(null); } catch {}
    try { window.location.hash = ''; } catch {}
  };

  // Persist last joined match so refresh doesn't "lose" the game.
  useEffect(() => {
    try {
      if (matchID) window.localStorage.setItem('politikum.lastMatchID', String(matchID));
      else window.localStorage.removeItem('politikum.lastMatchID');
      if (playerID != null) window.localStorage.setItem('politikum.lastPlayerID', String(playerID));
      else window.localStorage.removeItem('politikum.lastPlayerID');
      if (credentials) window.localStorage.setItem('politikum.lastCredentials', JSON.stringify(credentials));
      else window.localStorage.removeItem('politikum.lastCredentials');
    } catch {}
  }, [matchID, playerID, credentials]);

  // Escape hatch: if match is gone or you get stuck, let the user clear local persistence.
  useEffect(() => {
    if (!matchID) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/games/politikum/${encodeURIComponent(String(matchID))}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        if (!cancelled) forgetMatch();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchID]);


  if (hash.startsWith('#/m') && !matchID) {
    // Mobile landing/lobby (once you joined, we continue into the match view)
    return (
      <div className="min-h-screen w-screen">
        <PolitikumWelcome
          onJoin={({ matchID: mid, playerID: pid, credentials: cred }) => {
            setMatchID(mid);
            setPlayerID(pid);
            setCredentials(cred);
          }}
        />
      </div>
    );
  }

  if (hash.startsWith('#/tournament/')) {
    const tid = hash.slice('#/tournament/'.length).split('?')[0];
    return <TournamentDetailPage tournamentId={tid} />;
  }

  if (hash.startsWith('#/tournament')) {
    return <TournamentPage />;
  }
  if (hash.startsWith('#/adminm/games')) {
    return <AdminMobileGamesPage />;
  }
  if (hash.startsWith('#/admin/tournament')) {
    return <AdminTournamentPage />;
  }
  if (hash.startsWith('#/admin/bugreports')) {
    return <AdminBugreportsPage />;
  }
  if (hash.startsWith('#/admin')) {
    return <AdminPage />;
  }

  if (!matchID) {
    return (
      <PolitikumWelcome
        onJoin={({ matchID: mid, playerID: pid, credentials: cred }) => {
          setMatchID(mid);
          setPlayerID(pid);
          setCredentials(cred);
        }}
      />
    );
  }

  return (
    <div className="relative">
      {isMobileRoute ? (
        mobileRotateGame ? (
          <div className="fixed inset-0 overflow-hidden">
            {/* Render the game in landscape inside a portrait phone (rotate the whole game) */}
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: '100vh',
                height: '100vw',
                transform: 'rotate(90deg) translateY(-100%)',
              }}
            >
              <GameClient matchID={matchID} playerID={playerID} credentials={credentials} />
            </div>
          </div>
        ) : (
          <GameClient matchID={matchID} playerID={playerID} credentials={credentials} />
        )
      ) : (
        <GameClient matchID={matchID} playerID={playerID} credentials={credentials} />
      )}

      {isMobileRoute && showRotateHint && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto select-none">
          <div className="w-[min(520px,92vw)] rounded-2xl border border-amber-900/30 bg-black/60 shadow-2xl p-5 text-amber-100">
            <div className="text-amber-600 font-black uppercase tracking-[0.3em] text-xs">Politikum</div>
            <div className="mt-2 text-lg font-black">Поверни телефон вертикально</div>
            <div className="mt-2 text-sm text-amber-100/80">Держим телефон вертикально, а игру рисуем горизонтально. Включи блокировку поворота.</div>
            <div className="mt-4 text-[12px] font-mono text-amber-200/70">(Окно исчезнет само, когда вернёшься в портрет)</div>
          </div>
        </div>
      )}

    </div>
  );
}
