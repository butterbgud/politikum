import React from 'react';

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      window.localStorage.setItem('citadel.lastError', JSON.stringify({
        at: Date.now(),
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? ''),
        componentStack: String(info?.componentStack ?? ''),
      }));
    } catch {}
    this.setState({ info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const lastError = readLocal('citadel.lastError');
    const snap = readLocal('citadel.lastSnapshot');

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)', color: '#ffe7a0',
        padding: '24px', overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, marginBottom: 10 }}>CITADEL CRASH</div>
          <div style={{ opacity: 0.85, marginBottom: 18 }}>
            Screenshot this screen and send it to Konsta. Then hard refresh.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              onClick={() => { try { window.localStorage.removeItem('citadel.lastError'); } catch {} try { window.localStorage.removeItem('citadel.lastSnapshot'); } catch {} window.location.reload(); }}
              style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid rgba(255,231,160,0.25)', background: 'rgba(255,255,255,0.06)', color: '#ffe7a0', fontWeight: 900, letterSpacing: 1, cursor: 'pointer' }}
            >
              Reload
            </button>
            <button
              onClick={() => { try { navigator.clipboard.writeText((lastError || '') + "\n\n" + (snap || '')); } catch {} }}
              style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid rgba(255,231,160,0.25)', background: 'rgba(255,255,255,0.06)', color: '#ffe7a0', fontWeight: 900, letterSpacing: 1, cursor: 'pointer' }}
            >
              Copy debug
            </button>
          </div>

          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Error</div>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,231,160,0.12)', borderRadius: 16, padding: 14 }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>

          <div style={{ fontSize: 14, opacity: 0.9, margin: '16px 0 8px' }}>Last snapshot</div>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,231,160,0.12)', borderRadius: 16, padding: 14 }}>
            {snap || '(no snapshot yet)'}
          </pre>

          <div style={{ fontSize: 14, opacity: 0.9, margin: '16px 0 8px' }}>Last error (stored)</div>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,231,160,0.12)', borderRadius: 16, padding: 14 }}>
            {lastError || '(none)'}
          </pre>
        </div>
      </div>
    );
  }
}
