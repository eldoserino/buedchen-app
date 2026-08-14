import { useEffect, useState } from 'react';

const REASON_LABELS = {
  low_confidence: 'Niedrige Konfidenz',
  few_reviews:    'Wenige Reviews',
  no_reviews:     'Keine Reviews',
};

function TagChip({ tag }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      background: '#e8e0d0',
      color: '#4a3728',
      fontSize: '12px',
      marginRight: '4px',
      marginBottom: '4px',
    }}>
      {tag}
    </span>
  );
}

function QueueCard({ entry, onResolve }) {
  const [loading, setLoading] = useState(false);
  const tags    = entry.ai_output?.tags    ?? [];
  const summary = entry.ai_output?.summary ?? null;

  async function resolve(accepted) {
    setLoading(true);
    try {
      await fetch(`/api/review-queue/${entry.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted }),
      });
      onResolve(entry.id);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <strong style={{ fontSize: '16px' }}>{entry.buedchen_name}</strong>
          <span style={{ marginLeft: '8px', color: '#888', fontSize: '13px' }}>
            {entry.veedel}{entry.veedel && entry.address ? ' · ' : ''}{entry.address}
          </span>
        </div>
        <span style={{
          padding: '2px 8px',
          background: '#fef3c7',
          color: '#92400e',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
        }}>
          {REASON_LABELS[entry.reason] ?? entry.reason}
        </span>
      </div>

      {summary && (
        <p style={{ margin: '8px 0', color: '#333', fontSize: '14px', fontStyle: 'italic' }}>
          „{summary}"
        </p>
      )}

      {tags.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {tags.map(t => <TagChip key={t} tag={t} />)}
        </div>
      )}

      {!summary && tags.length === 0 && (
        <p style={{ color: '#aaa', fontSize: '13px', margin: '8px 0 12px' }}>Kein AI-Output vorhanden</p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => resolve(true)}
          disabled={loading}
          style={{
            padding: '8px 20px',
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          Annehmen
        </button>
        <button
          onClick={() => resolve(false)}
          disabled={loading}
          style={{
            padding: '8px 20px',
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Ablehnen
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch('/api/review-queue')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { setEntries(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  function handleResolve(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '22px' }}>Review Queue</h1>
        {!loading && !error && (
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            {entries.length === 0
              ? 'Alles erledigt.'
              : `${entries.length} Büdchen warten auf Review`}
          </p>
        )}
      </div>

      {loading && <p style={{ color: '#888' }}>Lade…</p>}
      {error   && <p style={{ color: '#dc2626' }}>Fehler: {error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p style={{ color: '#16a34a', fontWeight: 600 }}>✓ Queue ist leer.</p>
      )}

      {entries.map(entry => (
        <QueueCard key={entry.id} entry={entry} onResolve={handleResolve} />
      ))}
    </div>
  );
}
