-- LeadFlow initial schema for Amazon RDS PostgreSQL 15+.
-- Apply with: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(160) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'agent'
        CHECK (role IN ('owner', 'admin', 'manager', 'agent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assigned_to UUID,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    company VARCHAR(180),
    email VARCHAR(255),
    phone VARCHAR(32) NOT NULL,
    phone_normalized VARCHAR(32) NOT NULL,
    source VARCHAR(80) NOT NULL DEFAULT 'manual',
    status VARCHAR(30) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'contacted', 'qualified', 'interested', 'converted', 'not_interested', 'invalid', 'do_not_call')),
    priority VARCHAR(16) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    notes TEXT,
    ai_score SMALLINT CHECK (ai_score BETWEEN 0 AND 100),
    ai_summary TEXT,
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, phone_normalized),
    CONSTRAINT leads_assigned_member_fk
        FOREIGN KEY (organization_id, assigned_to)
        REFERENCES organization_members(organization_id, user_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, created_by)
        REFERENCES organization_members(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS campaign_leads (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, campaign_id, lead_id),
    FOREIGN KEY (organization_id, campaign_id)
        REFERENCES campaigns(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, lead_id)
        REFERENCES leads(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    agent_id UUID,
    provider VARCHAR(40) NOT NULL DEFAULT 'exotel',
    provider_call_id VARCHAR(180),
    status VARCHAR(24) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'initiated', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'cancelled')),
    outcome VARCHAR(40),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    recording_url TEXT,
    transcript TEXT,
    ai_summary TEXT,
    ai_sentiment VARCHAR(20),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, lead_id)
        REFERENCES leads(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, agent_id)
        REFERENCES organization_members(organization_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS calls_provider_call_unique
    ON calls(provider, provider_call_id)
    WHERE provider_call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    assigned_to UUID,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (organization_id, lead_id)
        REFERENCES leads(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, assigned_to)
        REFERENCES organization_members(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    user_id UUID,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (organization_id, lead_id)
        REFERENCES leads(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, user_id)
        REFERENCES organization_members(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    consent_status VARCHAR(20) NOT NULL
        CHECK (consent_status IN ('granted', 'withdrawn', 'unknown', 'not_required')),
    source VARCHAR(100),
    evidence_reference TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (organization_id, lead_id)
        REFERENCES leads(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(40) NOT NULL,
    provider_event_id VARCHAR(180) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (organization_id, user_id)
        REFERENCES organization_members(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS leads_org_status_idx ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS leads_org_assignee_idx ON leads(organization_id, assigned_to);
CREATE INDEX IF NOT EXISTS leads_org_created_idx ON leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_created_idx ON calls(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_lead_created_idx ON calls(organization_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS followups_due_idx ON follow_ups(organization_id, due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS activities_lead_created_idx ON activities(organization_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_org_created_idx ON audit_logs(organization_id, created_at DESC);

-- RLS is defense in depth. The API sets these transaction-local values on every
-- tenant-scoped query. Never connect to the DB from a browser client.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'leads', 'campaigns', 'campaign_leads', 'calls',
        'follow_ups', 'activities', 'consent_records', 'audit_logs'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
        EXECUTE format(
            $policy$
                CREATE POLICY tenant_isolation ON %I
                USING (
                    organization_id = NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    )::uuid
                )
                WITH CHECK (
                    organization_id = NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    )::uuid
                )
            $policy$,
            table_name
        );
    END LOOP;
END $$;

-- organizations and organization_members are only accessed by the API.
-- The API always filters membership queries by both user_id and organization_id.

-- Use a dedicated non-superuser application role in production. Table owner and
-- RDS master users can bypass RLS; do not use the master user in the application.
