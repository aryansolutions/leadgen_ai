import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    organizationName: '',
    organizationSlug: '',
    fullName: '',
    email: '',
    password: '',
  });

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(form);
      } else {
        await login({
          organizationSlug: form.organizationSlug,
          email: form.email,
          password: form.password,
        });
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setError('');
  }

  return (
    <div className="auth-screen">
      <section className="auth-decoration">
        <div className="brand-lockup light-brand">
          <div className="brand-mark">L</div>
          <div>
            <strong>LeadFlow</strong>
            <span>Sales workspace</span>
          </div>
        </div>

        <div className="auth-message">
          <span className="eyebrow">YOUR SALES WORKSPACE</span>
          <h1>Make every conversation count.</h1>
          <p>
            Bring leads, campaigns and AI-assisted calling together in one
            focused workspace.
          </p>

          <div className="auth-feature-list">
            <span>
              <UserRound size={17} /> One clear view of every lead
            </span>
            <span>
              <Activity size={17} /> Follow-ups that never get lost
            </span>
            <span>
              <Bot size={17} /> AI-assisted conversations
            </span>
          </div>
        </div>

        <span className="auth-footer">
          LeadFlow CRM · Built for growing teams
        </span>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <span className="eyebrow">
            {mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}
          </span>

          <h2>
            {mode === 'login' ? 'Sign in to LeadFlow' : 'Create your workspace'}
          </h2>

          <p className="muted">
            {mode === 'login'
              ? 'Enter your workspace details to continue.'
              : 'Set up your company workspace and owner account.'}
          </p>

          {mode === 'register' && (
            <>
              <label>Company / workspace name</label>
              <div className="input-wrap">
                <Building2 size={17} />
                <input
                  name="organizationName"
                  value={form.organizationName}
                  onChange={updateField}
                  placeholder="Acme Sales"
                  required
                />
              </div>

              <label>Your full name</label>
              <div className="input-wrap">
                <UserRound size={17} />
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={updateField}
                  placeholder="Your name"
                  required
                />
              </div>
            </>
          )}

          {mode === 'login' && (
            <>
              <label>Workspace slug</label>
              <div className="input-wrap">
                <Building2 size={17} />
                <input
                  name="organizationSlug"
                  value={form.organizationSlug}
                  onChange={updateField}
                  placeholder="acme-sales-a1b2c3"
                  required
                />
              </div>
            </>
          )}

          <label>Email address</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={updateField}
              placeholder="you@company.com"
              required
            />
          </div>

          <label>Password</label>
          <div className="input-wrap">
            <LockKeyhole size={17} />
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={updateField}
              placeholder="At least 10 characters"
              minLength={mode === 'register' ? 10 : 1}
              required
            />
          </div>

          {error && <div className="alert error-alert">{error}</div>}

          <button className="primary-button full-button" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create workspace'}
            <ArrowRight size={17} />
          </button>

          <div className="auth-toggle">
            {mode === 'login'
              ? 'New to LeadFlow?'
              : 'Already have a workspace?'}
            <button type="button" onClick={toggleMode}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
