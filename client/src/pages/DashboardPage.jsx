import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Headphones,
  Target,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';

const metricCards = [
  { key: 'total_leads', label: 'Total leads', icon: Users, tone: 'blue' },
  { key: 'new_leads', label: 'New leads', icon: Target, tone: 'violet' },
  { key: 'qualified_leads', label: 'Qualified leads', icon: UserCheck, tone: 'green' },
  { key: 'calls_30_days', label: 'Calls · 30 days', icon: Headphones, tone: 'orange' },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/dashboard/summary')
      .then((result) => setSummary(result.summary))
      .catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>Good work starts with a clear view.</h1>
          <p>Here is what is happening across your workspace.</p>
        </div>

        <Link className="primary-button" to="/leads">
          View leads <ArrowUpRight size={16} />
        </Link>
      </div>

      {error && <div className="alert error-alert">{error}</div>}

      <div className="metric-grid">
        {metricCards.map((metric) => {
          const Icon = metric.icon;

          return (
            <div className="metric-card" key={metric.key}>
              <div className={`metric-icon ${metric.tone}`}>
                <Icon size={19} />
              </div>
              <span className="metric-label">{metric.label}</span>
              <strong className="metric-value">
                {summary
                  ? Number(summary[metric.key] || 0).toLocaleString()
                  : '—'}
              </strong>
              <span className="metric-footnote">Workspace total</span>
            </div>
          );
        })}
      </div>

      <div className="dashboard-lower-grid">
        <section className="panel welcome-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GET MOVING</span>
              <h2>Your next steps</h2>
            </div>
          </div>

          <div className="quick-action-list">
            <Link to="/leads">
              <span className="quick-action-icon"><Users size={18} /></span>
              <span>
                <strong>Add or import leads</strong>
                <small>Bring your contacts into LeadFlow</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>

            <Link to="/campaigns">
              <span className="quick-action-icon"><Target size={18} /></span>
              <span>
                <strong>Create a campaign</strong>
                <small>Organise leads around an objective</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>

            <Link to="/calling">
              <span className="quick-action-icon"><Headphones size={18} /></span>
              <span>
                <strong>Review calling setup</strong>
                <small>Configure consent and provider details</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>

        <section className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h2>Calling snapshot</h2>
            </div>
          </div>

          <div className="snapshot-row">
            <span>Completed calls · 30 days</span>
            <strong>{summary?.completed_calls_30_days ?? '—'}</strong>
          </div>
          <div className="snapshot-row">
            <span>Converted leads</span>
            <strong>{summary?.converted_leads ?? '—'}</strong>
          </div>
          <div className="snapshot-row">
            <span>Overdue follow-ups</span>
            <strong className="warning-number">
              {summary?.overdue_follow_ups ?? '—'}
            </strong>
          </div>

          <p className="panel-note">
            Metrics update from your workspace database.
          </p>
        </section>
      </div>
    </>
  );
}
