import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Headphones,
  PhoneCall,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

export default function CallingPage() {
  const [leads, setLeads] = useState([]);
  const [calls, setCalls] = useState([]);
  const [selectedLead, setSelectedLead] = useState('');
  const [callerId, setCallerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    const [leadResult, callResult] = await Promise.all([
      apiRequest('/leads?limit=100'),
      apiRequest('/calling'),
    ]);

    setLeads(leadResult.leads);
    setCalls(callResult.calls);
  }, []);

  useEffect(() => {
    loadData().catch((loadError) => setError(loadError.message));
  }, [loadData]);

  async function startCall(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const result = await apiRequest(`/calling/start/${selectedLead}`, {
        method: 'POST',
        body: JSON.stringify({ callerId: callerId || undefined }),
      });

      setMessage(
        `${result.message} Call reference: ${result.providerCallId}`,
      );
      await loadData();
    } catch (callError) {
      setError(callError.message);
    } finally {
      setLoading(false);
    }
  }

  async function summarizeCall(callId) {
    setError('');
    setMessage('Generating call summary...');

    try {
      const result = await apiRequest(`/ai/calls/${callId}/summarize`, {
        method: 'POST',
      });

      setMessage(result.summary.summary || 'Call summary generated.');
      await loadData();
    } catch (summaryError) {
      setError(summaryError.message);
      setMessage('');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VOICE WORKSPACE</span>
          <h1>AI calling</h1>
          <p>
            Launch consent-based AI voice calls and review call outcomes.
          </p>
        </div>

        <button className="secondary-button" onClick={() => loadData()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {message && <div className="alert success-alert">{message}</div>}
      {error && <div className="alert error-alert">{error}</div>}

      <div className="calling-layout">
        <section className="panel call-launch-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEW OUTBOUND CALL</span>
              <h2>Start an AI conversation</h2>
            </div>
            <div className="metric-icon violet">
              <Bot size={19} />
            </div>
          </div>

          <p className="muted">
            Choose a lead with documented AI voice-call consent. The calling
            service will dial the lead and connect the conversation to your AI
            voice assistant.
          </p>

          <form onSubmit={startCall} className="call-form">
            <label className="field-label">
              Select lead
              <select
                value={selectedLead}
                onChange={(event) => setSelectedLead(event.target.value)}
                required
              >
                <option value="">Choose a lead...</option>
                {leads
                  .filter((lead) => lead.status !== 'do_not_call')
                  .map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.first_name} {lead.last_name} · {lead.phone}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field-label">
              Exotel caller ID (optional)
              <input
                value={callerId}
                onChange={(event) => setCallerId(event.target.value)}
                placeholder="Your approved ExoPhone"
              />
            </label>

            <div className="call-compliance-note">
              <span className="note-indicator" />
              Only leads with recorded, valid consent for AI voice calls can be
              dialled.
            </div>

            <button
              className="primary-button full-button"
              disabled={loading || !selectedLead}
            >
              <PhoneCall size={17} />
              {loading ? 'Starting call...' : 'Start AI call'}
            </button>
          </form>
        </section>

        <section className="panel voice-info-panel">
          <div className="voice-orb">
            <Bot size={30} />
          </div>
          <span className="eyebrow">AI VOICE ASSISTANT</span>
          <h2>Natural, guided conversations.</h2>
          <p>
            The voice bridge streams audio between Exotel and OpenAI Realtime.
            The assistant identifies itself as AI, follows the supplied lead
            context and honours opt-out requests.
          </p>

          <div className="voice-info-list">
            <span><span className="status-dot" /> Realtime audio streaming</span>
            <span><span className="status-dot" /> Call transcript capture</span>
            <span><span className="status-dot" /> AI call summaries</span>
          </div>

          <p className="panel-note">
            Live calling requires an approved Exotel account, ExoPhone, public
            HTTPS/WSS endpoint, provider credentials and valid consent.
          </p>
        </section>
      </div>

      <section className="panel table-panel calls-table-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CALL HISTORY</span>
            <h2>Recent calls</h2>
          </div>
          <span className="result-count">{calls.length} records</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Created</th>
                <th>AI review</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td>
                    <strong>{call.first_name} {call.last_name}</strong>
                    <small className="table-subtext">{call.phone}</small>
                  </td>
                  <td>{call.agent_name || '—'}</td>
                  <td>
                    <span className={`status-pill status-${call.status}`}>
                      {call.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>{call.duration_seconds || 0}s</td>
                  <td>{new Date(call.created_at).toLocaleString()}</td>
                  <td>
                    {call.transcript ? (
                      <button
                        className="text-action"
                        onClick={() => summarizeCall(call.id)}
                      >
                        <Sparkles size={14} /> Summarize
                      </button>
                    ) : (
                      <span className="muted">Pending transcript</span>
                    )}
                  </td>
                </tr>
              ))}

              {calls.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No calls yet. Your completed and attempted calls will appear
                    here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
