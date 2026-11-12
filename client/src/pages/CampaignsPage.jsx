import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus, Users } from 'lucide-react';
import { apiRequest } from '../lib/api';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const loadCampaigns = useCallback(async () => {
    const result = await apiRequest('/campaigns');
    setCampaigns(result.campaigns);
  }, []);

  useEffect(() => {
    loadCampaigns().catch((loadError) => setError(loadError.message));
  }, [loadCampaigns]);

  async function createCampaign(event) {
    event.preventDefault();
    setError('');

    try {
      await apiRequest('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });

      setName('');
      setDescription('');
      setShowForm(false);
      await loadCampaigns();
    } catch (createError) {
      setError(createError.message);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PIPELINE ORGANISATION</span>
          <h1>Campaigns</h1>
          <p>Group leads into focused outreach initiatives.</p>
        </div>

        <button
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={17} /> New campaign
        </button>
      </div>

      {error && <div className="alert error-alert">{error}</div>}

      {showForm && (
        <form className="panel campaign-form" onSubmit={createCampaign}>
          <div className="panel-heading">
            <h2>Create campaign</h2>
          </div>

          <label className="field-label">
            Campaign name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          </label>

          <label className="field-label">
            Description
            <textarea
              rows="3"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
            <button className="primary-button">Create campaign</button>
          </div>
        </form>
      )}

      <div className="campaign-grid">
        {campaigns.map((campaign) => (
          <article className="panel campaign-card" key={campaign.id}>
            <div className="campaign-card-icon">
              <Megaphone size={19} />
            </div>
            <span className={`status-pill status-${campaign.status}`}>
              {campaign.status}
            </span>
            <h2>{campaign.name}</h2>
            <p>{campaign.description || 'No description added.'}</p>

            <div className="campaign-card-footer">
              <span>
                <Users size={15} /> {campaign.lead_count} leads
              </span>
              <small>{new Date(campaign.created_at).toLocaleDateString()}</small>
            </div>
          </article>
        ))}

        {campaigns.length === 0 && (
          <div className="panel empty-campaigns">
            <Megaphone size={26} />
            <h2>No campaigns yet</h2>
            <p>Create a campaign to organise leads by outreach objective.</p>
          </div>
        )}
      </div>
    </>
  );
}
