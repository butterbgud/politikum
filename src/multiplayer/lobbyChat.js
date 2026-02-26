import { sqlite } from './db.js';

function nowMs() {
  return Date.now();
}

export function lobbyChatIsEnabled() {
  const db = sqlite;
  try {
    const row = db.prepare("SELECT value FROM lobby_chat_settings WHERE key='enabled'").get();
    if (!row) return true; // default on
    const v = String(row.value || '').trim();
    if (!v) return true;
    return v !== '0' && v.toLowerCase() !== 'false';
  } catch {
    return true;
  }
}

export function lobbyChatSetEnabled(enabled) {
  const db = sqlite;
  const v = enabled ? '1' : '0';
  db.prepare("INSERT INTO lobby_chat_settings(key,value) VALUES('enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(v);
  return { ok: true, enabled: lobbyChatIsEnabled() };
}

export function lobbyChatClear() {
  const db = sqlite;
  db.prepare('DELETE FROM lobby_chat_messages').run();
  return { ok: true };
}

export function lobbyChatList({ limit = 50 } = {}) {
  const db = sqlite;
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  const enabled = lobbyChatIsEnabled();
  const rows = db.prepare('SELECT id, created_at AS createdAt, player_id AS playerId, name, text FROM lobby_chat_messages ORDER BY id DESC LIMIT ?').all(n);
  const items = (rows || []).reverse();
  return { ok: true, enabled, items };
}

export function lobbyChatInsert({ playerId, name, text }) {
  const db = sqlite;
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'empty' };
  if (t.length > 400) return { ok: false, error: 'too_long' };

  const createdAt = nowMs();
  const pid = playerId == null ? null : String(playerId || '').trim() || null;
  const nm = name == null ? null : String(name || '').trim() || null;

  db.prepare('INSERT INTO lobby_chat_messages(created_at, player_id, name, text) VALUES(?,?,?,?)').run(createdAt, pid, nm, t);

  // cap: keep last 500
  try {
    db.prepare('DELETE FROM lobby_chat_messages WHERE id NOT IN (SELECT id FROM lobby_chat_messages ORDER BY id DESC LIMIT 500)').run();
  } catch {}

  return { ok: true };
}
