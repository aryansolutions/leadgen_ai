-- Run this as the RDS master user AFTER applying migrations.
-- Replace the password placeholder with a long random secret.

CREATE ROLE leadflow_app
    LOGIN
    PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOBYPASSRLS;

GRANT CONNECT ON DATABASE leadflow TO leadflow_app;
GRANT USAGE ON SCHEMA public TO leadflow_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON organizations,
       users,
       organization_members,
       leads,
       campaigns,
       campaign_leads,
       calls,
       follow_ups,
       activities,
       consent_records,
       webhook_events,
       audit_logs,
       schema_migrations
    TO leadflow_app;

-- The app should not be able to change schema or migration history.
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM leadflow_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
