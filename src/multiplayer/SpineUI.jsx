import React, { useEffect, useMemo, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { CitadelGame as PolitikumGame } from './Game.js';

const SERVER = (import.meta.env.VITE_SERVER || window.localStorage.getItem('politikum.server') || `http://${window.location.hostname}:8001`);
const lobbyClient = new LobbyClient({ server: SERVER });

const NAMES = [
  'Hakon', 'Rixa', 'Gisela', 'Dunstan', 'Irmgard', 'Cedric', 'Freya', 'Ulric', 'Yolanda', 'Tristan',
  'Beatrix', 'Lambert', 'Maude', 'Odilia', 'Viggo', 'Sibylla', 'Katarina', 'Norbert', 'Quintus',
];



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
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}>
      <div className="w-full max-w-4xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Tournaments</div>
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
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}>
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
                        <div className="bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Players</div>
              <div className="mt-2 grid gap-1 text-sm font-serif">
                {(t.players || []).map((p) => (
                  <div key={p.playerId} className="text-amber-100/90">{p.name || p.playerId}</div>
                ))}
                {(!(t.players || []).length) && <div className="text-amber-200/40 italic">No players yet.</div>}
              </div>
            </div>

            <div className="bg-black/40 border border-amber-900/20 rounded-2xl px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Round 1 tables</div>
                <div className="flex items-center gap-2">
                  {tablesErr && <div className="text-[10px] font-mono text-amber-200/50">{tablesErr}</div>}
                  {(tablesErr && hasAdminToken) && (
                    <button type="button" onClick={() => { window.location.hash = '#/admin/tournament'; }} className="text-[10px] font-mono text-amber-200/60 hover:text-amber-50">Admin</button>
                  )}
                </div>
              </div>

              <div className="mt-2 grid gap-2">
                {tables.map((tb) => (
                  <div key={tb.id || String(tb.tableIndex)} className="rounded-xl border border-amber-900/20 bg-black/30 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-black text-amber-50 text-xs uppercase tracking-widest">Table {tb.tableIndex}</div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-mono text-amber-200/60">{tb.status || 'pending'}</div>
                        {tb.winnerPlayerId && (
                          <div className="text-[10px] font-mono text-emerald-300/80">winner: {tb.winnerPlayerId}</div>
                        )}
                        {tb.matchId && (
                          <button type="button" onClick={() => openMatch(tb.matchId)} className="text-[10px] font-mono text-amber-200/70 hover:text-amber-50">Open match</button>
                        )}
                        {(!tb.matchId && hasAdminToken) && (
                          <button type="button" disabled={loading} onClick={() => adminCreateMatch(tb.id)} className="text-[10px] font-mono text-amber-200/70 hover:text-amber-50 disabled:opacity-60">Create match</button>
                        )}
                        {(tb.matchId && !tb.winnerPlayerId && hasAdminToken) && (
                          <button type="button" disabled={loading} onClick={async () => {
                            try {
                              const tok = String(window.localStorage.getItem('politikum.adminToken') || '');
                              if (!tok) throw new Error('Admin token missing');
                              const seatStr = window.prompt('Winner seat number (1..N):');
                              if (!seatStr) return;
                              const seat = Math.max(1, Number.parseInt(String(seatStr), 10) || 0) - 1;
                              const res = await fetch(`${SERVER}/admin/tournament/${tournamentId}/table/${tb.id}/set_winner`, {
                                method: 'POST',
                                headers: { 'X-Admin-Token': tok, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ seat }),
                              });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                              await load();
                            } catch (e) { setErr(e?.message || String(e)); }
                          }} className="text-[10px] font-mono text-amber-200/70 hover:text-amber-50 disabled:opacity-60">Set winner</button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 grid gap-0.5 text-sm font-serif">
                      {(tb.seats || []).map((s) => (
                        <div key={String(s.seat)} className="text-amber-100/90">Seat {Number(s.seat) + 1}: {s.name || s.playerId}</div>
                      ))}
                      {(!(tb.seats || []).length) && <div className="text-amber-200/40 italic">No seats.</div>}
                    </div>
                  </div>
                ))}

                {(!tables.length && !tablesErr) && <div className="text-amber-200/40 italic">No tables yet.</div>}
              </div>
            </div>

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
                                <div className="text-[10px] font-mono text-amber-200/50">{tb.status || 'pending'}</div>
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
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}>
      <div className="w-full max-w-5xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Admin / tournaments (v1)</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { window.location.hash = '#/admin'; }} className="text-xs font-mono text-amber-200/60 hover:text-amber-50">Stats</button>
            <button type="button" disabled className="text-xs font-mono text-amber-50/90 font-black">Tournaments</button>
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
                  <option value="single_elim">single_elim</option>
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

        <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black mb-2">Tournaments</div>
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
  const [liveMatches, setLiveMatches] = useState([]);
  const [liveTotal, setLiveTotal] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
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
    return 'top10';
  });

  useEffect(() => {
    try { window.localStorage.setItem('politikum.welcomeRightTab', rightTab); } catch {}
  }, [rightTab]);

  const [error, setError] = useState('');

  const saveToken = (value) => {
    setToken(value);
    try {
      window.localStorage.setItem('politikum.adminToken', value);
    } catch {}
  };

  useEffect(() => {
    if (!token) return;
    fetchAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchAdmin = async () => {
    if (!token) {
      setError('Set X-Admin-Token first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const headers = { 'X-Admin-Token': token };
      const [summaryRes, gamesRes, matchesRes, lbRes] = await Promise.all([
        fetch(`${SERVER}/admin/summary`, { headers }),
        fetch(`${SERVER}/admin/games?limit=50&offset=0`, { headers }),
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
      setGames(gamesJson.items || []);
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
    <div className="min-h-screen w-screen text-amber-50 flex items-center justify-center p-4 bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}>
      <div className="w-full max-w-5xl bg-slate-950/80 border border-amber-900/40 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Admin / stats (MVP)</div>
          </div>
          <div className="flex items-center gap-3">
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

            <button
              type="button"
              onClick={() => { window.location.hash = '#/admin/tournament'; }}
              className="text-xs font-mono text-amber-200/60 hover:text-amber-50"
            >
              Tournaments
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
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-black">Leaderboard (MVP)</div>
          </div>
          <div className="overflow-x-auto -mx-2 mb-6">
            <table className="min-w-full text-left text-xs font-mono text-amber-100/90">
              <thead>
                <tr className="border-b border-amber-900/40">
                  <th className="px-2 py-2 whitespace-nowrap">Player</th>
                  <th className="px-2 py-2 whitespace-nowrap">Elo</th>
                  <th className="px-2 py-2 whitespace-nowrap">Wins</th>
                  <th className="px-2 py-2 whitespace-nowrap">Games</th>
                  <th className="px-2 py-2 whitespace-nowrap">Last win</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={i} className="border-b border-amber-900/20">
                    <td className="px-2 py-2 align-top whitespace-nowrap">{r.name || '(anon)'}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap text-amber-100/90 font-black tabular-nums">{Number(r.rating ?? 0) || 0}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap text-emerald-300 font-black tabular-nums">{r.wins}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap tabular-nums">{r.games}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{formatTime(r.lastFinishedAt)}</td>
                  </tr>
                ))}
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
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-left text-xs font-mono text-amber-100/90">
              <thead>
                <tr className="border-b border-amber-900/40">
                  <th className="px-2 py-2 whitespace-nowrap">Finished</th>
                  <th className="px-2 py-2 whitespace-nowrap">Players</th>
                  <th className="px-2 py-2 whitespace-nowrap">Winner</th>
                  <th className="px-2 py-2 whitespace-nowrap">Duration</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.matchId} className="border-b border-amber-900/20">
                    <td className="px-2 py-2 align-top whitespace-nowrap">{formatTime(g.finishedAt || g.createdAt)}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(g.players || []).map((p, idx) => (
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
                    <td className="px-2 py-2 align-top whitespace-nowrap">{g.winnerName || '—'}</td>
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
        'relative w-32 aspect-[2/3] rounded-2xl overflow-hidden border shadow-2xl transition-transform ' +
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

function LobbyBoard({ G, ctx, moves, playerID }) {
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

      // Bind stable player identity into match state (for Elo/rankings).
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
      style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}
    >
      <div className="w-full max-w-3xl bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-amber-600 font-black uppercase tracking-[0.3em]">Politikum</div>
            <div className="text-amber-100/70 font-serif mt-1">Pregame lobby</div>
          </div>
          <div className="text-xs font-mono text-amber-200/60">Players: {activeCount}</div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          {/* Main column */}
          <div className="flex flex-col gap-4 min-h-[520px]">
            {/* Lobby chat */}
            <div className="bg-slate-900/40 rounded-2xl p-4 border border-amber-900/20 flex flex-col flex-1 min-h-0">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Lobby chat</div>
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {(G.chat || []).map((m, i) => (
                  <div key={i} className="text-sm font-serif">
                    <span className="text-amber-200/60 font-mono text-[11px] mr-2">{m.sender}:</span>
                    <span className="text-amber-50/90">{m.text}</span>
                  </div>
                ))}
                {(!(G.chat || []).length) && <div className="text-amber-200/40 italic text-sm font-serif">No messages yet.</div>}
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
                  placeholder="Say something…"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-100 font-black text-xs uppercase"
                >
                  Send
                </button>
              </form>
            </div>

          </div>

          {/* Side panel */}
          <div className="grid gap-4">
            <div className="bg-slate-900/40 rounded-2xl p-3 border border-amber-900/20">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Beta login</div>
              <div className="mt-2 flex gap-2">
                <input
                  value={betaPassword}
                  onChange={(e) => setBetaPassword(e.target.value)}
                  placeholder="beta password"
                  type="password"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-amber-900/30 text-amber-50 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={doBetaLogin}
                  className="px-4 py-1.5 rounded-xl bg-emerald-700/60 hover:bg-emerald-600/70 text-emerald-50 font-black text-xs uppercase tracking-widest"
                >
                  Login
                </button>
              </div>
              <div className="mt-2 text-[10px] font-mono text-amber-200/50">
                {authToken ? 'Logged in (token saved).' : 'Not logged in.'}
                {authStatus ? ` · ${authStatus}` : ''}
              </div>
            </div>

            {/* Seats */}
            <div className="bg-slate-900/40 rounded-2xl p-3 border border-amber-900/20">
              <div className="text-xs uppercase tracking-widest text-amber-200/70 font-black">Seats</div>
              <div className="mt-3 grid gap-2">
                {(G.players || []).filter((p) => !!p?.active).map((p) => {
                  const active = !!p.active;
                  const bot = !!p.isBot || String(p.name || '').startsWith('[B]');
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-amber-900/10">
                      <div className="flex items-center gap-2">
                        <div className={(active ? 'text-amber-100' : 'text-amber-900/50') + ' font-serif text-sm'}>
                          {p.name || `Seat ${p.id}`}
                        </div>
                        <div className="text-[10px] font-mono text-amber-200/50">id:{p.id}</div>
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
                    Add bot
                  </button>
                  <button
                    onClick={() => moves.startGame()}
                    className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-widest"
                  >
                    Start game
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 text-[11px] text-amber-200/40 font-mono">phase: {String(ctx.phase || '')}</div>
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
  const logRef = React.useRef(null);
  const me = (G.players || []).find((p) => String(p.id) === String(playerID));

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

  const refreshBotLease = () => {
    try {
      const now = Date.now();
      window.localStorage.setItem(BOT_LOCK_KEY, JSON.stringify({ playerID: String(playerID), ts: now }));
    } catch {}
  };

  const response = G.response || null;
  const pending = G.pending || null;
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
  const p8SwapSpec = responseKind === 'cancel_persona' ? (response?.persona8Swap || null) : null;
  const canPersona8Swap = !!p8SwapSpec && String(p8SwapSpec.playerId || '') === String(playerID);
  const [showEventSplash, setShowEventSplash] = useState(false);
  const [showActionSplash, setShowActionSplash] = useState(false);
  const ENABLE_EVENT_SPLASH = true;
  const ENABLE_ACTION_SPLASH = false;

  const [logCollapsed, setLogCollapsed] = useState(false);
  const [hoverHandIndex, setHoverHandIndex] = useState(null);
  const [hoverMyCoalition, setHoverMyCoalition] = useState(null);
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

  const myVpBase = (me?.coalition || []).reduce((s, c) => s + Number(c.baseVp ?? c.vp ?? 0), 0);
  const myVpTokens = (me?.coalition || []).reduce((s, c) => s + Number(c.vpDelta || 0), 0);
  const myVpPassives = (me?.coalition || []).reduce((s, c) => s + Number(c.passiveVpDelta || 0), 0);
  const myCoalitionPoints = (me?.coalition || []).reduce((s, c) => s + Number(c.vp ?? (Number(c.baseVp ?? 0) + Number(c.vpDelta || 0) + Number(c.passiveVpDelta || 0))), 0);

  const pendingTokens = pending?.kind === 'place_tokens_plus_vp' && String(pending?.playerId) === String(playerID);
  const pendingTokensRemaining = pendingTokens ? Number(pending?.remaining || 0) : 0;
  const pendingTokensSource = pendingTokens ? String(pending?.sourceCardId || '') : '';

  const pendingPersona45 = pending?.kind === 'persona_45_steal_from_opponent' && String(pending?.playerId) === String(playerID);
  const pendingPersona45Source = pendingPersona45 ? String(pending?.sourceCardId || '') : '';

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

  const pendingP16 = pending?.kind === 'persona_16_discard3_from_hand' && String(pending?.playerId) === String(playerID);
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
      if (key === 'l') {
        setLogCollapsed((v) => !v);
        return;
      }
      if (key === 'escape') {
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
        // skip/decline response window
        if (responseActive && String(response?.playedBy) !== String(playerID)) {
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

      // p23 choice: 0..3 tokens
      if (pendingP23 && (key === '0' || key === '1' || key === '2' || key === '3')) {
        try { moves.persona23ChooseSelfInflict(Number(key)); } catch {}
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
    if (!shouldDriveBots) return; // single driver
    const needTick = !!G.response || String(G.pending?.kind || '') === 'resolve_persona_after_response';
    if (!needTick) return;

    const t = setInterval(() => {
      refreshBotLease();
      try { moves.tick(); } catch {}
    }, 500);
    return () => clearInterval(t);
  }, [moves, G?.response, G?.pending?.kind, G?.gameOver, shouldDriveBots]);

  // Keep event card visible while the event is still being resolved.
  useEffect(() => {
    const id = G.lastEvent?.id;
    if (!id) return;
    setShowEventSplash(true);
  }, [G.lastEvent?.id]);

  useEffect(() => {
    if (!showEventSplash) return;
    // When no pending decisions remain, fade the event card shortly after.
    if (G.pending) return;
    const t = setTimeout(() => setShowEventSplash(false), 800);
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

  return (
    <div className="w-full min-h-screen bg-[url('/assets/ui/table.webp')] bg-cover bg-center text-amber-100">
      <div className="fixed top-3 left-3 z-[2000] select-none">
        <div className="mb-1 pointer-events-none select-none text-amber-200/70 font-black tracking-[0.35em] uppercase text-[10px]">Politikum</div>
        <button
          type="button"
          onClick={() => {
            try {
              const full = (typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit');
              navigator.clipboard?.writeText?.(full);
            } catch {}
          }}
          className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90"
          title={`app ${typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'nogit'}\nengine ${typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? __ENGINE_GIT_SHA_SHORT__ : 'nogit'}\n(click to copy full app sha)`}
        >
          {typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'nogit'}@{typeof __GIT_SHA_SHORT__ !== 'undefined' ? __GIT_SHA_SHORT__ : (typeof __GIT_SHA__ !== 'undefined' ? String(__GIT_SHA__).slice(0,7) : 'nogit')}
          {typeof __ENGINE_GIT_SHA_SHORT__ !== 'undefined' ? ` · eng@${__ENGINE_GIT_SHA_SHORT__}` : ''}
        </button>
      </div>

      {/* (admin link removed from in-game UI) */}

      {/* Opponents */}
      <div className="fixed top-20 left-0 right-0 z-[700] flex justify-evenly pointer-events-auto">
        {opponents.map((p) => {
          const hand0 = p.hand || [];
          const coal = (p.coalition || []);
          const nHand = (hand0 || []).length;
          const nCoal = (coal || []).length;
          const nTotal = nHand + nCoal;

          const pts = (coal || []).reduce((s, c) => s + Number(c.vp || 0), 0); // MVP points

          // Single opponent fan: show coalition faces reliably (don’t let a big hand hide them).
          // We want: backs VERY tight, faces less tight.
          const backs = Array.from({ length: nHand }, () => ({ kind: 'back' }));
          const faces = coal.map((c) => ({ kind: 'face', card: c }));

          // Always include all coalition cards, and only show as many backs as fit.
          const MAX_SHOW = 12;
          const backsShown = Math.min(nHand, Math.max(0, MAX_SHOW - faces.length));
          const oppFanCards = [...backs.slice(0, backsShown), ...faces];

          const show = oppFanCards.length;
          const stepBack = 6;  // 2x tighter
          const stepFace = 24; // more spacing so tokens are visible

          const calcWidth = () => {
            const shown = oppFanCards.slice(0, show);
            let w = 140;
            for (let i = 1; i < shown.length; i++) {
              w += shown[i].kind === 'back' ? stepBack : stepFace;
            }
            return w;
          };
          const width = calcWidth();
          const hoverIdx = hoverOppCoalition?.[p.id] ?? null;

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
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/90 z-[2000] whitespace-nowrap justify-center">
                  <span>{p.name}</span>
                  <span className="text-amber-200/50">•</span>
                  <span className="text-amber-200/80">{pts}p</span>
                </div>
              )}

              {/* single opponent fan (coalition + hand) */}
              <div
                className={
                  "relative h-44 pointer-events-auto transition-colors rounded-2xl " +
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
                    const coalFaces = (p.coalition || []).filter((c) => c.type === 'persona');
                    if (coalFaces.length >= 1) {
                      playSfx('ui', 0.35);
                      setPlacementModeOpp({ cardId: pickTargetForPersona9.cardId, targetId: String(p.id), neighborId: null, side: 'right' });
                      setPickTargetForPersona9(null);
                      return;
                    }
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
                  }
                }}
                onPointerMove={(e) => {
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
                  const shown = oppFanCards.slice(0, show);
                  const firstFace = shown.findIndex((it) => it.kind === 'face');
                  setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: firstFace >= 0 ? firstFace : null }));
                }}
                onPointerLeave={() => setHoverOppCoalition((m) => ({ ...(m || {}), [p.id]: null }))}
                title={`Total: ${nTotal}`}
              >
                {/* count */}
                {nTotal > 0 && (
                  <div className="absolute -top-15 left-1/2 -translate-x-1/2 bg-black/70 border border-black/40 text-amber-100 font-mono font-black text-[12px] px-2 py-0.5 rounded-full">{nTotal}</div>
                )}

                {oppFanCards.slice(0, show).map((it, i) => {
                  const t = show <= 1 ? 0.5 : i / (show - 1);
                  const rot = (t - 0.5) * 12;

                  // variable spacing: backs tighter, faces looser
                  const shown = oppFanCards.slice(0, show);
                  let left = 0;
                  for (let k = 0; k < i; k++) {
                    left += (shown[k + 1]?.kind === 'back') ? stepBack : stepFace;
                  }

                  const dist = (hoverIdx == null) ? 99 : Math.abs(i - hoverIdx);
                  const isBack = it.kind === 'back';
                  const scale = (hoverIdx == null) ? 1 : (isBack ? 1 : scaleByDist2(dist));
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
                  const canClickFaceForP7 = pendingP7 && it.kind === 'face' && it.card?.type === 'persona' && !isImmovablePersona(it.card);
                  const canClickFaceForP14 = pending?.kind === 'discard_one_persona_from_any_coalition' && String(pending?.playerId) === String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP11 = pendingP11Pick && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP13 = pendingP13 && String(p.id) === String(pendingP13AttackerId) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card);
                  const canClickFaceForP5 = G.pending?.kind === 'persona_5_pick_liberal' && String(playerID) === String(G.pending.playerId) && String(p.id) !== String(playerID) && it.kind === 'face' && it.card?.type === 'persona' && !it.card?.shielded && !isImmovablePersona(it.card) && Array.isArray(it.card?.tags) && it.card.tags.includes('faction:liberal');

                  const canClickFace = canClickFaceForOppPlace || canClickFaceForP8Swap || canClickFaceForP21 || canClickFaceForP26 || canClickFaceForP28 || canClickFaceForP37 || canClickFaceForP3A || canClickFaceForP7 || canClickFaceForP14 || canClickFaceForP11 || canClickFaceForP13 || canClickFaceForP5;
                  return (
                    <div
                      key={`${p.id}-${i}-${id}`}
                      className={"absolute bottom-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl " + (canClickFace ? "cursor-pointer ring-2 ring-emerald-400/40" : "")}
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
                        if (canClickFaceForP5) {
                          try { playSfx('ui', 0.35); moves.persona5PickLiberal(String(p.id), it.card.id); } catch {}
                          return;
                        }
                      }}
                    >
                      {it.kind === 'face' && String(it.card?.shieldedBy || '') === 'action_13' && (
                        <img src={'/cards/action_13.webp'} alt={'action_13'} className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] object-cover opacity-80 -z-10" style={{ transform: 'translateY(10px) rotate(-2deg)' }} draggable={false} />
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
                      {it.kind === 'face' && (it.card?.shielded || it.card?.blockedAbilities) && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black">
                          {it.card?.shielded && (
                            <span className="px-1.5 py-0.5 rounded-full bg-sky-700/90 border border-sky-300/40 text-sky-50 shadow-md">SH</span>
                          )}
                          {it.card?.blockedAbilities && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-800/90 border border-red-300/40 text-red-50 shadow-md">X</span>
                          )}
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
        {/* Deck (Draw) */}
        <button
          type="button"
          onClick={() => { if (!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) return; playSfx('draw'); moves.drawCard(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% + 148px)', bottom: 'calc(18% - 155px)', width: '172px' }}
          title={G.pending ? "Resolve pending" : ((G.drawsThisTurn || 0) >= 2 ? "No more draws" : (G.hasPlayed ? "Already played" : ((G.drawsThisTurn || 0) === 1 ? "Draw 2nd (ends turn)" : "Draw card")))}
          aria-disabled={!isMyTurn || G.pending || G.hasPlayed || (G.drawsThisTurn || 0) >= 2}
        >
          <div className="relative w-full h-auto">
            {(isMyTurn && !G.hasDrawn) && (
              <img src="/assets/ui/touch_deck_glow.png" alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none animate-pulse" draggable={false} />
            )}
            <img src="/assets/ui/touch_deck.png" alt="Deck" className="w-full h-auto" draggable={false} />
            {showHotkeys && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] font-mono font-black text-amber-200/90 drop-shadow">(c)</div>
            )}
          </div>
        </button>

                {/* Cookies (End Turn) */}
        <button
          type="button"
          onClick={() => { if (!isMyTurn || !G.hasDrawn || !G.hasPlayed) return; playSfx('ui'); moves.endTurn(); }}
          className={
            "fixed pointer-events-auto select-none outline-none transition-transform duration-150 ease-out hover:-translate-y-1 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] " +
            ((!isMyTurn || !G.hasDrawn || !G.hasPlayed) ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:scale-100" : "cursor-pointer")
          }
          style={{ right: 'calc(2% - 12px)', top: 'calc(3% - 96px)', width: '280px' }}
          title={(!G.hasDrawn ? "Draw first" : (!G.hasPlayed ? "Play first" : "End turn"))}
          aria-disabled={!isMyTurn || !G.hasDrawn || !G.hasPlayed}
        >
          <div className="relative w-full h-auto">
            <img src="/assets/ui/touch_cookies.png" alt="End Turn" className="w-full h-auto" draggable={false} />
            {showHotkeys && (
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[12px] font-mono font-black text-amber-200/90 drop-shadow">(e)</div>
            )}
          </div>
        </button>
      </div>

      {/* Pending banner */}
      {pendingTokens && pendingTokensRemaining > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingTokensSource || 'EVENT'}: place +1 tokens on your coalition — click a coalition card ({pendingTokensRemaining} left)
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
            {pendingP23Source}: choose self-inflict (-1) tokens then draw
            <span className="ml-3 text-amber-200/70">(keys 0..3)</span>
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
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            p13 ({pendingP13Source}): click attacker persona to give -1
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
        const show = remaining.slice(0, 9);

        return (
          <div className="fixed inset-0 z-[6000] pointer-events-none select-none">
            <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/70 border border-amber-900/30 rounded-2xl px-5 py-3 text-amber-100/90 font-mono text-[12px] shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="opacity-80">{pendingP34Source}:</span> p34 guess persona
                  <span className="ml-3 text-amber-200/70">(press 1..{Math.max(1, show.length)})</span>
                </div>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700/70 border border-amber-900/20 text-amber-50 font-black text-[11px]"
                  onClick={() => { try { moves.persona34GuessTopdeck('skip'); } catch {} }}
                >
                  Skip
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                {show.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    className="px-3 py-1 rounded-full bg-amber-600/80 hover:bg-amber-500/80 border border-amber-200/20 text-amber-950 font-black text-[11px] pointer-events-auto"
                    onClick={() => { try { moves.persona34GuessTopdeck(id); } catch {} }}
                    title={`(${i + 1})`}
                  >
                    {i + 1} · {id.replace('persona_', 'p')}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-amber-200/60 text-[10px] text-center">
                (showing first 9 unseen personas; Esc/Skip clears)
              </div>
            </div>
          </div>
        );
      })()}

      {pendingP16 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[6000] pointer-events-none select-none">
          <div className="bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px]">
            {pendingP16Source}: discard 3 from hand (keys 1..3 select, Enter confirm)
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
      {responseActive && String(response?.playedBy) !== String(playerID) && (
        (responseKind === 'cancel_action' && (haveAction6 || (haveAction14 && responseTargetsMe))) ||
        (responseKind === 'cancel_persona' && haveAction8)
      ) && (
        <div className="fixed inset-0 z-[6000] pointer-events-none select-none">
          {/* cancel_action stays as a compact pill */}
          {responseKind === 'cancel_action' && (
            <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-black/70 border border-amber-900/30 rounded-full px-5 py-3 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-4 pointer-events-auto">
              <div className="flex items-center gap-3">
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

                <div>
                  {haveAction6 && 'Action played — respond with Action 6 to cancel'}
                  {!haveAction6 && haveAction14 && responseTargetsMe && 'You are targeted — respond with Action 14 to cancel the effect'}
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
              </div>
            </div>
          )}

          {/* cancel_persona (Action 8): show the card in the center with left/right options */}
          {responseKind === 'cancel_persona' && haveAction8 && (() => {
            const c8 = (me?.hand || []).find((c) => c?.type === 'action' && String(c.id).split('#')[0] === 'action_8');
            if (!c8) return null;
            return (
              <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-6 pointer-events-auto">
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

                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/70 border border-amber-900/20 text-amber-50 font-black text-[12px] shadow-2xl"
                  onClick={() => { try { moves.skipResponseWindow(); } catch {} }}
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
      {(G.pending?.kind === 'action_4_discard' || G.pending?.kind === 'action_9_discard_persona') && String(playerID) === String(G.pending.targetId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from coalition</div>
            <div className="mt-2 text-amber-100/80 text-sm">
              {G.pending?.kind === 'action_9_discard_persona'
                ? 'Choose 1 PERSONA from your coalition to discard.'
                : 'Choose 1 card from your coalition to discard.'}
            </div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.coalition || []).filter((c) => (G.pending?.kind === 'action_9_discard_persona' ? c.type === 'persona' : true) && !c.shielded && !isImmovablePersona(c)).map((c) => (
                <Card
                  key={c.id}
                  card={c}
                  onClick={() => moves.discardFromCoalition(c.id)}
                  disabled={false}
                  showCheck={isPolishedCard(c)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Event_12b: each affected player discards 1 card from hand */}
      {G.pending?.kind === 'event_12b_discard_from_hand' && Array.isArray(G.pending.targetIds) && G.pending.targetIds.includes(String(playerID)) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Discard from hand</div>
            <div className="mt-2 text-amber-100/80 text-sm">EVENT {G.pending.sourceCardId}: choose 1 card from your hand to discard.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.hand || []).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
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

      {/* Persona prompts (no modals) */}
      {G.pending?.kind === 'persona_3_choice' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            SVTV (p3): click a LEFTWING persona to discard it, or press B for option B
          </div>
        </div>
      )}

      {pendingP12 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            Savin (p12): click one adjacent red_nationalist to get +2
          </div>
        </div>
      )}

      {pendingP16 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>p16: select 3 cards to discard ({(p16DiscardPick || []).length}/3)</span>
            <button
              type="button"
              className={( (p16DiscardPick || []).length >= 3 ? 'bg-emerald-700/80 hover:bg-emerald-600/80 ' : 'bg-slate-800/60 ' ) + 'pointer-events-auto px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20'}
              onClick={() => {
                const ids = (p16DiscardPick || []).slice(0, 3);
                if (ids.length < 3) return;
                try { moves.persona16Discard3FromHand(ids[0], ids[1], ids[2]); } catch {}
                setP16DiscardPick([]);
              }}
            >
              Confirm
            </button>
            <button
              type="button"
              className="pointer-events-auto px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60"
              onClick={() => setP16DiscardPick([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {pendingP7 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
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
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            p5: click a LIBERAL persona in an opponent’s coalition
          </div>
        </div>
      )}

      {/* Persona_14 discard prompt (no modal) */}
      {G.pending?.kind === 'discard_one_persona_from_any_coalition' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            p14: click any persona on the table to discard it
          </div>
        </div>
      )}

      {/* Persona_11 (Solovei): no top pill (use card glow/scale instead) */}

      {/* Persona_17 pick opponent */}
      {pendingP17PickOpp && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
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
          <div className="fixed inset-x-0 top-14 z-[2600] flex items-start justify-center pointer-events-none select-none">
            <div className="pointer-events-auto bg-black/75 border border-amber-900/30 rounded-3xl shadow-2xl p-4 max-w-[96vw]">
              <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">p17: pick a persona from {target?.name || pendingP17TargetId}</div>
              <div className="mt-3 flex gap-3 flex-wrap justify-center">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-emerald-400/40 hover:border-emerald-300 cursor-pointer shadow-2xl hover:scale-[1.02] transition-transform"
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
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            {pendingPersona45Source}: click an opponent to steal 1 random card
          </div>
        </div>
      )}

      {canPersona8Swap && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            persona_8: click the just-played persona to SWAP with it
          </div>
        </div>
      )}

      {canPersona10Cancel && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            persona_10: click Naki in your hand to cancel this effect
          </div>
        </div>
      )}

      {/* Event_16: discard one of YOUR personas, then draw 1 (no modal) */}
      {G.pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(playerID) === String(G.pending.playerId) && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl">
            EVENT {G.pending.sourceCardId}: click a persona in YOUR coalition to discard it (then draw 1)
          </div>
        </div>
      )}

      {/* Action_7: pick any persona to block abilities & clear tokens */}
      {G.pending?.kind === 'action_7_block_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 7 — Block persona</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose any persona in play. That persona&apos;s abilities are blocked and its VP tokens are cleared.</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).map((p) => (
                <div key={p.id} className="">
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.blockPersonaForAction7(String(p.id), c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_13: shield one of YOUR personas */}
      {G.pending?.kind === 'action_13_shield_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[700px] max-w-[94vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 13 — Shield</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose one of your personas to shield. It can&apos;t be targeted by actions/abilities, and +1 gains are reduced by 1.</div>
            <div className="mt-4 flex gap-3 flex-wrap">
              {(me?.coalition || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                  onClick={() => moves.shieldPersonaForAction13(c.id)}
                  title={c.name || c.id}
                >
                  <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_17: choose opponent persona to receive -1 tokens */}
      {G.pending?.kind === 'action_17_choose_opponent_persona' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 17 — Apply -1 tokens</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose an opponent persona. It gets 2 × -1 tokens (or 4 × -1 if it is persona_3, persona_38, persona_41 or persona_43).</div>
            <div className="mt-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.players || []).filter((p) => String(p.id) !== String(playerID)).map((p) => (
                <div key={p.id} className="">
                  <div className="text-amber-200/70 text-[11px] font-mono font-black tracking-widest">{p.name}</div>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(p.coalition || []).filter((c) => c.type === 'persona' && !c.shielded && !isImmovablePersona(c)).map((c) => (
                      <button
                        key={c.id}
                        className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
                        onClick={() => moves.applyAction17ToPersona(c.id)}
                        title={c.name || c.id}
                      >
                        <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action_18: return persona from discard to hand */}
      {G.pending?.kind === 'action_18_pick_persona_from_discard' && String(playerID) === String(G.pending.attackerId) && (
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Action 18 — Return from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose a persona from the discard pile to return to your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).filter((c) => c.type === 'persona' && !isImmovablePersona(c)).map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
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
        <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 backdrop-blur-sm backdrop-filter pointer-events-auto">
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-5 w-[860px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Bykov (p20) — Take from discard</div>
            <div className="mt-2 text-amber-100/80 text-sm">Choose any 1 card from the discard pile to take into your hand.</div>
            <div className="mt-4 flex flex-wrap gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {(G.discard || []).filter((c) => c.type !== 'event').map((c) => (
                <button
                  key={c.id}
                  className="w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl hover:scale-[1.02] transition-transform"
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
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/65 backdrop-blur-sm pointer-events-auto">
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
                  // Leave match state (client-side) — simplest reliable way is full reload.
                  try { window.location.hash = ''; } catch {}
                  try { window.location.reload(); } catch {}
                }
              }}
              className="px-4 py-2 rounded-full bg-black/60 border border-amber-900/30 text-amber-100/90 font-mono font-black text-[12px] hover:bg-black/70"
              title={String(matchID || '').startsWith('t_') ? 'Back to tournament' : 'Back to lobby'}
            >
              {String(matchID || '').startsWith('t_') ? 'Back to tournament' : 'Back to lobby'}
            </button>
          </div>
          <div className="bg-black/70 border border-amber-900/30 rounded-3xl shadow-2xl p-6 w-[1100px] max-w-[96vw]">
            <div className="text-amber-200/80 text-[10px] uppercase tracking-[0.3em] font-black">Game over</div>
            <div className="mt-2 text-amber-100 font-serif text-2xl font-bold">
              Winner: {(G.players || []).find((p) => String(p.id) === String(G.winnerId))?.name || G.winnerId}
            </div>
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
                  <div className="flex flex-col items-center gap-2 relative pt-10">
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/55 border border-amber-900/20 rounded-full px-4 py-1 text-[11px] font-mono font-black tracking-widest z-[2000] whitespace-nowrap justify-center" style={{ color }}>
                      <span>{p?.name || pid}</span>
                      <span className="opacity-50">•</span>
                      <span>{scoreNow(pid)}vp</span>
                    </div>
                    <div
                      className="relative h-44 pointer-events-auto"
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
                            className="absolute bottom-0 w-32 aspect-[2/3] rounded-2xl overflow-hidden border border-black/40 shadow-2xl"
                            style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: 'center center' }}
                          >
                            <img src={c.img} alt={c.id} className="w-full h-full object-cover" draggable={false} />
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

                    {/* Per-card VP breakdown (base + tokens + passives) */}
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
                        <div className="text-amber-200/60 text-[10px] uppercase tracking-[0.3em] font-black">Progress (turn → VP)</div>
                        <svg width={W} height={H} className="mt-2 rounded-xl bg-black/25 border border-amber-900/20">
                          {/* axes */}
                          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />
                          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="rgba(251,191,36,0.25)" />
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
                    return `${p.name}: ${pts} vp (coalition ${(p.coalition || []).length})`;
                  }).join('\n')}
              </div>
            )}

            <div className="mt-4 text-amber-200/60 text-xs">(Refresh to start a new match for now.)</div>
          </div>
        </div>
      )}

      {/* Event card: big centered while resolving */}
      {ENABLE_EVENT_SPLASH && showEventSplash && !!G.lastEvent && (
        <div className="fixed inset-0 z-[2500] pointer-events-none select-none">
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
        <div className="fixed inset-0 z-[2600] pointer-events-none">
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
      <div className={
        "fixed top-1/2 -translate-y-1/2 left-4 z-[950] pointer-events-auto transition-transform duration-300 ease-out " +
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

      {/* My coalition (built row fan) */}
      <div className={"fixed bottom-6 left-1/2 -translate-x-1/2 -ml-[100px] z-[5000] pointer-events-auto transition-all " + (G.gameOver ? "opacity-0 pointer-events-none blur-sm" : "opacity-100")}
        style={{ transform: 'translateX(calc(-50% - 300px))' }}>

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
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                // smoother: use card center thresholds instead of rounding
                const idx = Math.max(0, Math.min(coal.length - 1, Math.floor((x + step / 2) / step)));
                setHoverMyCoalition(idx);
              }}
              onMouseLeave={() => setHoverMyCoalition(null)}
            >
              {coal.map((c, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const rot = (t - 0.5) * 12;
                const left = i * step;

                const dist = hoverMyCoalition == null ? 99 : Math.abs(i - hoverMyCoalition);
                const z = hoverMyCoalition == null ? i : (1000 - dist);

                const pendingEvent16 = pending?.kind === 'event_16_discard_self_persona_then_draw1' && String(pending?.playerId) === String(playerID);
                const pendingP21Here = pendingP21;
                const pendingP26Here = pendingP26;
                const pendingP28Here = pendingP28;
                const pendingP32Here = pendingP32;
                const pendingP12Here = pendingP12 && (String(c.id) === pendingP12Left || String(c.id) === pendingP12Right);
                const pendingP7Here = pendingP7 && c.type === 'persona' && !isImmovablePersona(c);
                const canUseP39Here = canUseP39 && String(c.id).split('#')[0] === 'persona_39';
                const pendingP14Here = pending?.kind === 'discard_one_persona_from_any_coalition' && String(pending?.playerId) === String(playerID) && c.type === 'persona' && !c.shielded && !isImmovablePersona(c);

                const isP11 = String(c.id).split('#')[0] === 'persona_11';
                const canUseP11 = pendingP11Offer && isP11;
                const finalScale = (hoverMyCoalition == null ? 1 : scaleByDist3(dist)) * (canUseP11 ? 1.2 : 1);

                return (
                  <button
                    type="button"
                    key={c.id}
                    className={
                      "absolute bottom-0 w-40 aspect-[2/3] rounded-2xl overflow-hidden border-2 shadow-2xl transition-colors " +
                      (canUseP11
                        ? "border-emerald-300/80 ring-4 ring-emerald-400/25 shadow-[0_0_50px_rgba(16,185,129,0.35)] cursor-pointer"
                        : (placementMode || pendingTokens || pendingEvent16 || pendingP21Here || pendingP26Here || pendingP28Here || pendingP32Here || pendingP12Here || pendingP7Here || canUseP39Here || pendingP14Here
                          ? (canUseP39Here
                            ? "border-emerald-300/80 hover:border-emerald-200 cursor-pointer ring-4 ring-emerald-400/25 shadow-[0_0_45px_rgba(16,185,129,0.28)]"
                            : (pendingP14Here ? "border-emerald-400/60 hover:border-emerald-300 cursor-pointer" : "border-emerald-400/50 hover:border-emerald-300 cursor-pointer"))
                          : "border-black/40 cursor-default"))
                    }
                    style={{ left, zIndex: z, transform: `rotate(${rot}deg) scale(${finalScale})`, transformOrigin: 'bottom center' }}
                    title={c.id}
                    onClick={(e) => {
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
                      if (pendingP21Here) {
                        try { moves.persona21InvertTokens(String(playerID), c.id); } catch {}
                        return;
                      }
                      if (pendingP26Here) {
                        // Can't pick red nationalist from own coalition usually, but allow.
                        try { moves.persona26PurgeRedNationalist(String(playerID), c.id); } catch {}
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
                      if (!pendingTokens) return;
                      try { moves.applyPendingToken(c.id); } catch {}
                    }}
                  >
                    {String(c?.shieldedBy || '') === 'action_13' && (
                      <img src={'/cards/action_13.webp'} alt={'action_13'} className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] object-cover opacity-80 -z-10" style={{ transform: 'translateY(10px) rotate(-2deg)' }} draggable={false} />
                    )}
                    <img src={c.img} alt={c.id} className="relative z-10 w-full h-full object-cover" draggable={false} />
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
                    {(c.shielded || c.blockedAbilities) && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1 text-[9px] font-mono font-black">
                        {c.shielded && (
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
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>Place persona: click LEFT/RIGHT half of a coalition card to insert before/after</span>
            <button type="button" className="px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60" onClick={() => setPlacementMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!!placementModeOpp && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2500] pointer-events-none select-none">
          <div className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-full px-4 py-2 text-amber-100/90 font-mono text-[12px] shadow-2xl flex items-center gap-3">
            <span>Place into opponent: click LEFT/RIGHT half of their coalition card to insert</span>
            <button type="button" className="px-3 py-1 rounded-full text-[11px] font-black border border-amber-900/20 bg-slate-800/60 hover:bg-slate-700/60" onClick={() => setPlacementModeOpp(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Total VP (bottom-right) */}
      <div className="fixed bottom-4 right-4 z-[2500] pointer-events-none select-none">
        <div className="bg-black/60 border border-amber-900/20 rounded-2xl px-4 py-2 text-amber-100/90 font-mono shadow-2xl">
          <div className="font-black tracking-widest text-[14px]">VP: {myCoalitionPoints}</div>
          <div className="mt-0.5 text-[10px] text-amber-200/60 tabular-nums">
            Base {myVpBase} + Tokens {myVpTokens} + Passives {myVpPassives}
          </div>
        </div>
      </div>

      {/* Hand fan */}
      <div className="fixed bottom-6 right-[410px] z-[999] pointer-events-auto">
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
            const scale = hoverHandIndex == null ? 1 : scaleByDist(dist);
            const z = hoverHandIndex == null ? idx : (1000 - dist);

            const baseId = String(card.id).split('#')[0];

            const canPlayPersona = isMyTurn && !responseActive && G.hasDrawn && card.type === 'persona';
            const canPlayAction = isMyTurn && !responseActive && G.hasDrawn && !G.hasPlayed && card.type === 'action';

            // out-of-turn cancels
            // Allow clicking cancels as long as server is advertising a response window.
            // Server enforces actual expiry; UI shouldn't block.
            const canCancelAction = responseKind === 'cancel_action' && card.type === 'action' && baseId === 'action_6' && String(response.playedBy) !== String(playerID);
            const canCancelPersona = responseKind === 'cancel_persona' && card.type === 'action' && baseId === 'action_8' && String(response.playedBy) !== String(playerID) && String(response?.personaCard?.id || '').split('#')[0] !== 'persona_33';
            const canCancelWithPersona10 = canPersona10Cancel && card.type === 'persona' && baseId === 'persona_10';

            const baseIs14 = baseId === 'action_14';
            const canCancelEffectOnMe = responseKind === 'cancel_action' && responseTargetsMe && baseIs14;

            const canClickP16 = pendingP16; // select cards to discard
            const canClick = canClickP16 || canPlayPersona || canPlayAction || canCancelAction || canCancelPersona || canCancelEffectOnMe || canCancelWithPersona10;

            return (
              <button
                key={card.id}
                onClick={(e) => {
                  if (!canClick) return;
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
                    moves.persona10CancelFromHand(card.id);
                  }
                }}
                aria-disabled={!canClick}
                className={
                  'absolute bottom-0 w-36 aspect-[2/3] rounded-2xl border-2 transition-all duration-200 ease-out shadow-xl overflow-visible ' +
                  (canClickP16
                    ? ((p16DiscardPick || []).includes(card.id) ? 'border-emerald-300 hover:border-emerald-200 cursor-pointer ring-2 ring-emerald-400/30' : 'border-emerald-500/40 hover:border-emerald-300 cursor-pointer')
                    : (canClick ? ((canCancelAction || canCancelPersona) ? 'border-emerald-500/50 hover:border-emerald-300 cursor-pointer' : 'border-amber-700/40 hover:border-amber-400 cursor-pointer') : 'border-slate-900 cursor-not-allowed'))
                }
                style={{
                  left: `${left}px`,
                  zIndex: z,
                  transform: `rotate(${rot}deg) scale(${scale})`,
                  transformOrigin: 'bottom center',
                }}
                title={card.id}
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

      {/* Turn status (below version hashes) */}
      <div className="fixed top-12 left-3 z-[900] pointer-events-none select-none">
        <div className="bg-black/45 border border-amber-900/20 rounded-xl px-3 py-2 text-[10px] font-mono text-amber-200/70 whitespace-pre">
          turn: {String(ctx.currentPlayer) === String(playerID) ? 'YOU' : String(ctx.currentPlayer)}  drawn:{String(!!G.hasDrawn)}  played:{String(!!G.hasPlayed)}  event:{String(!!G.lastEvent)}{(G && G.debugLastEndTurnReject) ? `\nendTurn blocked: ${G.debugLastEndTurnReject}` : ''}
        </div>
      </div>
    </div>
  );
}

function Board(props) {
  const phase = String(props?.ctx?.phase || '');
  if (phase === 'lobby') return <LobbyBoard {...props} />;
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

  useEffect(() => {
    (async () => {
      try {
        if (!authToken) { setAuthRating(null); return; }
        const pid = (() => {
          try { return String(window.localStorage.getItem('politikum.sessionPlayerId') || ''); } catch { return ''; }
        })();
        if (!pid) { setAuthRating(null); return; }
        const res = await fetch(`${SERVER}/public/leaderboard?limit=50`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const row = (json?.items || []).find((r) => String(r?.playerId || '') === pid);
        if (!row) return;
        setAuthRating(Number(row.rating ?? null));
      } catch {}
    })();
  }, [authToken]);

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

  // “prelobby / hosted / gamescreen” — first two screens are a straight copy of Citadel layout.
  return (
    <div
      className="h-screen w-screen text-slate-100 font-sans bg-cover bg-center bg-fixed bg-no-repeat overflow-hidden flex flex-row"
      style={{ backgroundImage: "url('/assets/lobby_bg.jpg')" }}
    >
      {/* Top-right links */}
      <div className="fixed top-3 right-3 z-[2000] select-none flex items-center gap-2">
        <a
          href="#/admin"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto bg-black/70 border border-amber-900/30 rounded-lg px-2 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200/70 hover:text-amber-50"
        >
          ADMIN
        </a>

      </div>

      {/* Top bar: alias + beta login */}
      <div className="fixed top-3 left-3 right-3 z-[1999] pointer-events-none">
        <div className="pointer-events-auto max-w-3xl mx-auto flex flex-row gap-3 items-center justify-end">
          <div className="flex min-w-0 flex items-center gap-2 justify-end">
            {authToken ? (
              <>
                <div className="text-xs font-mono text-black/80 whitespace-nowrap">
                  {String(playerName || 'User').trim() || 'User'}{(authRating != null && !Number.isNaN(Number(authRating))) ? ` (${Math.round(Number(authRating))})` : ''}
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

      <div className="bg-transparent p-8 pt-28 flex items-center justify-center w-full">
        <div className="flex gap-8 items-start max-w-7xl w-full mx-auto px-4 max-h-[85vh]">
          {/* LEFT: NEWS + CHAT */}
          <div className="flex-1 min-w-0 space-y-6">
            <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[10px] uppercase tracking-widest text-amber-500/70 font-black">News</div>
                <div className="text-[10px] font-mono text-amber-200/40">Server: {SERVER}</div>
              </div>
              <div className="mt-3 text-amber-100/80 font-serif text-sm">
                <div className="font-black text-amber-50">Welcome to Politikum</div>
                <div className="mt-1 opacity-80">Work in progress. If something breaks, refresh first; if it still breaks, ping Konsta.</div>
              </div>
              <div className="mt-4 space-y-2 text-xs font-mono text-amber-200/60">
                <div>• Pre-lobby list shows only lobby-phase matches (no in-progress clutter).</div>
                <div>• Admin: /admin has KILL match + DEDUP KONSTA + Elo recompute.</div>
                <div>• Next: real pre-lobby chat + prettier changelog feed.</div>
              </div>
            </div>

            <div className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-amber-900/20 shadow-2xl flex flex-col h-[460px] max-h-[60vh]">
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
                      <div className="text-[10px] font-mono text-amber-200/50">{m.name || m.playerId || 'Anon'}</div>
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
                  placeholder={authToken ? (lobbyChatEnabled ? 'Say something…' : 'Chat disabled') : 'Login in /#/beta to chat…'}
                  disabled={!authToken || !lobbyChatEnabled}
                  className="flex-1 bg-black/40 border border-amber-900/30 rounded-lg px-3 py-2 text-amber-200 font-serif text-sm focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={sendLobbyChat}
                  disabled={!authToken || !lobbyChatEnabled || !String(lobbyChatInput||'').trim()}
                  className="flex-none px-4 py-2 bg-amber-600 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all disabled:opacity-60 hover:bg-amber-500"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: MODULES */}
          <div className="w-[360px] max-w-full space-y-6">
            <div className="bg-black/75 backdrop-blur-xl p-8 rounded-3xl border border-amber-900/40 shadow-2xl flex flex-col h-fit">
              <h2 className="text-xl font-serif text-amber-500 font-bold mb-4 text-center uppercase tracking-widest border-b border-amber-500/20 pb-2">Game List</h2>

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
                  Games
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
                  Top 10
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
                  Tournaments
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
                          <span className="font-serif text-amber-100 text-sm font-bold truncate">{r.name}</span>
                        </div>
                        <span className="text-xs font-mono text-amber-100/90 font-black tabular-nums">{Number(r.rating ?? 0) || 0}</span>
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
                    <h3 className="text-[10px] uppercase tracking-widest text-amber-900/60 mb-2 border-b border-amber-900/10 pb-1">Available Games</h3>
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
                    {(!matches || matches.length === 0) && <div className="text-center py-8 text-amber-900/40 italic text-sm font-serif">Awaiting games...</div>}
                  </div>

                  <button onClick={createMatch} disabled={loading} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-amber-950 font-black rounded-xl uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-60">
                    Host New Realm
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
  }, []);

  const [matchID, setMatchID] = useState(null);
  const [playerID, setPlayerID] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [hash, setHash] = useState(() => window.location.hash || '');

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);


  if (hash.startsWith('#/tournament/')) {
    const tid = hash.slice('#/tournament/'.length).split('?')[0];
    return <TournamentDetailPage tournamentId={tid} />;
  }

  if (hash.startsWith('#/tournament')) {
    return <TournamentPage />;
  }
  if (hash.startsWith('#/admin/tournament')) {
    return <AdminTournamentPage />;
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

  return <GameClient matchID={matchID} playerID={playerID} credentials={credentials} />;
}
