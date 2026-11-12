
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileUp,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  PhoneCall,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

const emptyLead = {
  firstName: '',
  lastName: '',
  company: '',
  email: '',
  phone: '',
  source: 'manual',
  notes: '',
};

const leadFields = [
  { name: 'firstName', label: 'First name', required: true },
  { name: 'lastName', label: 'Last name' },
  { name: 'company', label: 'Company' },
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone number', required: true },
  { name: 'source', label: 'Lead source' },
];

export default function LeadsPage() {
  const [callingLeadId, setCallingLeadId] = useState(null);
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyLead);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Consent modal state
  const [consentLead, setConsentLead] = useState(null);
  const [consentEvidence, setConsentEvidence] = useState('');
  const [savingConsent, setSavingConsent] = useState(false);

  const fileInput = useRef(null);

  async function callLead(lead) {
    const confirmed = window.confirm(
      `Start an AI voice call to ${lead.first_name} at ${lead.phone}?\n\nOnly proceed if this person has explicitly consented to AI voice calls.`
    );

    if (!confirmed) return;

    setCallingLeadId(lead.id);
    setError('');
    setMessage('');

    try {
      const result = await apiRequest(`/calling/start/${lead.id}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setMessage(
        `Call initiated for ${lead.first_name}. Reference: ${result.providerCallId}`
      );
    } catch (callError) {
      setError(callError.message);
    } finally {
      setCallingLeadId(null);
    }
  }

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ search, status });
    const result = await apiRequest(`/leads?${params.toString()}`);

    setLeads(result.leads);
  }, [search, status]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadLeads().catch((loadError) => setError(loadError.message));
    }, 200);

    return () => clearTimeout(timeout);
  }, [loadLeads]);

  async function createLead(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/leads', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setForm(emptyLead);
      setShowForm(false);
      setMessage('Lead added successfully.');
      await loadLeads();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setLoading(false);
    }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const data = new FormData();
    data.append('file', file);
    setError('');
    setMessage('Importing leads...');

    try {
      const result = await apiRequest('/leads/import', {
        method: 'POST',
        body: data,
      });

      setMessage(
        `${result.imported} leads imported · ${result.skipped} skipped.`
      );

      await loadLeads();
    } catch (importError) {
      setError(importError.message);
      setMessage('');
    } finally {
      event.target.value = '';
    }
  }

  async function scoreLead(leadId) {
    setError('');
    setMessage('AI is reviewing this lead...');

    try {
      const result = await apiRequest(`/ai/leads/${leadId}/score`, {
        method: 'POST',
      });

      setMessage(`AI score: ${result.score}/100 · ${result.summary}`);
      await loadLeads();
    } catch (scoreError) {
      setError(scoreError.message);
      setMessage('');
    }
  }

  function openConsentModal(lead) {
    setConsentLead(lead);
    setConsentEvidence('');
    setError('');
    setMessage('');
  }

  function closeConsentModal() {
    if (savingConsent) return;

    setConsentLead(null);
    setConsentEvidence('');
  }

  async function recordConsent(event) {
    event.preventDefault();

    if (!consentLead || !consentEvidence.trim()) {
      setError('Enter a valid consent evidence reference.');
      return;
    }

    setSavingConsent(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/leads/${consentLead.id}/consent`, {
        method: 'POST',
        body: JSON.stringify({
          purpose: 'ai_voice_call',
          consentStatus: 'granted',
          source: 'agent_recorded',
          evidenceReference: consentEvidence.trim(),
        }),
      });

      const leadName = consentLead.first_name;

      setConsentLead(null);
      setConsentEvidence('');
      setMessage(`AI voice-call consent recorded for ${leadName}.`);

      await loadLeads();
    } catch (consentError) {
      setError(consentError.message);
    } finally {
      setSavingConsent(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTACT DATABASE</span>
          <h1>Leads</h1>
          <p>
            Keep every prospect organised and ready for the next conversation.
          </p>
        </div>

        <div className="heading-actions">
          <button
            className="secondary-button"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp size={16} /> Import CSV
          </button>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={importCsv}
          />

          <button
            className="primary-button"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={17} /> Add lead
          </button>
        </div>
      </div>

      {message && <div className="alert success-alert">{message}</div>}
      {error && <div className="alert error-alert">{error}</div>}

      {showForm && (
        <form className="panel lead-form" onSubmit={createLead}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEW CONTACT</span>
              <h2>Add a lead</h2>
            </div>
          </div>

          <div className="form-grid">
            {leadFields.map((field) => (
              <label className="field-label" key={field.name}>
                {field.label}
                <input
                  name={field.name}
                  value={form[field.name]}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      [field.name]: event.target.value,
                    })
                  }
                  required={Boolean(field.required)}
                />
              </label>
            ))}
          </div>

          <label className="field-label">
            Notes
            <textarea
              rows="2"
              value={form.notes}
              onChange={(event) =>
                setForm({
                  ...form,
                  notes: event.target.value,
                })
              }
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>

            <button className="primary-button" disabled={loading}>
              {loading ? 'Saving...' : 'Save lead'}
            </button>
          </div>
        </form>
      )}

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, phone..."
            />
          </div>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="interested">Interested</option>
            <option value="converted">Converted</option>
            <option value="do_not_call">Do not call</option>
          </select>

          <span className="result-count">{leads.length} shown</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Status</th>
                <th>AI score</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className="lead-name-cell">
                      <div className="avatar table-avatar">
                        {lead.first_name?.slice(0, 1)}
                      </div>

                      <span>
                        <strong>
                          {lead.first_name} {lead.last_name}
                        </strong>
                        <small>{lead.company || 'Individual'}</small>
                      </span>
                    </div>
                  </td>

                  <td>
                    <span>{lead.phone}</span>
                    <small className="table-subtext">
                      {lead.email || 'No email'}
                    </small>
                  </td>

                  <td>{lead.source}</td>

                  <td>
                    <span className={`status-pill status-${lead.status}`}>
                      {lead.status.replaceAll('_', ' ')}
                    </span>
                  </td>

                  <td>
                    {lead.ai_score == null ? (
                      <span className="muted">Not scored</span>
                    ) : (
                      <strong>{lead.ai_score}/100</strong>
                    )}
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        title="Call lead with AI"
                        onClick={() => callLead(lead)}
                        disabled={callingLeadId !== null}
                      >
                        {callingLeadId === lead.id ? (
                          <span>...</span>
                        ) : (
                          <PhoneCall size={16} />
                        )}
                      </button>

                      <button
                        title="AI score"
                        onClick={() => scoreLead(lead.id)}
                      >
                        <Sparkles size={16} />
                      </button>

                      <button
                        title="Record AI call consent"
                        onClick={() => openConsentModal(lead)}
                      >
                        <UserPlus size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {leads.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No leads found. Add a lead or import a CSV to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            CSV columns: firstName, lastName, company, email, phone, source, notes
          </span>
          <span>Duplicate phone numbers are skipped</span>
        </div>
      </section>

      {/* AI Voice Consent Modal */}
      {consentLead && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeConsentModal();
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-modal-title"
            className="panel"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              position: 'relative',
              background: 'var(--panel, #ffffff)',
              color: 'var(--text, #111827)',
              borderRadius: '14px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <button
              type="button"
              onClick={closeConsentModal}
              disabled={savingConsent}
              aria-label="Close consent modal"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <span className="eyebrow">CONSENT MANAGEMENT</span>

            <h2 id="consent-modal-title" style={{ marginTop: '8px' }}>
              Record AI Call Consent
            </h2>

            <p style={{ marginTop: '12px', lineHeight: 1.6 }}>
              Lead: <strong>{consentLead.first_name} {consentLead.last_name}</strong>
            </p>

            <p style={{ marginTop: '8px', lineHeight: 1.6 }}>
              Phone: <strong>{consentLead.phone}</strong>
            </p>

            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.12)',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
              Only record granted consent if this person has explicitly agreed
              to receive AI voice calls and genuine evidence of that agreement
              exists. Do not create or guess an evidence reference.
            </div>

            <form onSubmit={recordConsent}>
              <label
                className="field-label"
                htmlFor="consent-evidence"
                style={{ display: 'block', marginTop: '20px' }}
              >
                Consent evidence reference
              </label>

              <input
                id="consent-evidence"
                type="text"
                value={consentEvidence}
                onChange={(event) => setConsentEvidence(event.target.value)}
                placeholder="e.g. FORM-1024 or CRM-NOTE-55"
                maxLength={1000}
                required
                autoFocus
                disabled={savingConsent}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '11px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  boxSizing: 'border-box',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '24px',
                }}
              >
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeConsentModal}
                  disabled={savingConsent}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingConsent || !consentEvidence.trim()}
                >
                  {savingConsent ? 'Saving...' : 'Confirm Consent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
