# Production readiness checklist

The codebase provides the main application paths, but a real production launch
requires environment-specific verification and operational controls.

## Identity and SaaS tenancy

- [ ] Configure password reset and email verification.
- [ ] Implement invitations and membership management before onboarding external teams.
- [ ] Add account lockout / suspicious-login detection and session revocation.
- [ ] Rotate JWT signing secrets and define key rotation procedures.
- [ ] Verify tenant isolation with automated cross-organization API and RLS tests.
- [ ] Consider FORCE ROW LEVEL SECURITY after reviewing migration-owner workflows.
- [ ] Add an explicit policy for user deactivation and token revocation.

## Database

- [ ] Use the `leadflow_app` non-owner, non-BYPASSRLS role.
- [ ] Verify every tenant table is protected by RLS.
- [ ] Test all foreign-key paths with cross-tenant IDs.
- [ ] Use AWS RDS CA validation and private subnets.
- [ ] Configure backup retention, restore drills and deletion protection.
- [ ] Set connection pool size against RDS max_connections.
- [ ] Apply migrations from a controlled deployment job, not app startup.

## Calling and AI

- [ ] Confirm Exotel account KYC, approved caller ID, regional API host, and
      Voicebot / AgentStream entitlement.
- [ ] Verify the provider webhook authentication method for your account. This
      sample uses a high-entropy callback URL token and must be reviewed against
      the provider's security guidance.
- [ ] Verify Exotel media stream handshake, audio format, sample-rate conversion and interruption behaviour with real test calls.
- [ ] Test network failures, OpenAI rate limits, call disconnects and provider retries.
- [ ] Add hard call-duration and per-tenant spend limits.
- [ ] Add an immediate organisation-level and lead-level calling kill switch.
- [ ] Implement a durable opt-out / do-not-call suppression workflow.
- [ ] Validate consent evidence, purpose limitation, calling windows and DLT / TRAI obligations with counsel and the provider.
- [ ] Decide recording policy, retention, access control and disclosure.
- [ ] Run a human review of AI prompts and call outcomes.

## Application and operations

- [ ] Add automated unit, integration and end-to-end tests.
- [ ] Add request IDs, structured logs and error monitoring.
- [ ] Add per-tenant rate limits and quotas for imports, AI and calls.
- [ ] Add pagination cursors for large datasets and background CSV imports.
- [ ] Add audit-log writes for administrative and data-export actions.
- [ ] Add S3 private bucket policies and signed URLs if storing recordings.
- [ ] Configure WAF / edge protection and HTTPS certificates.
- [ ] Run dependency vulnerability scans and review the EC2 host security baseline.
- [ ] Test backup restoration and disaster recovery.
- [ ] Set CloudWatch alarms and AWS Budgets alerts.

## Current implementation boundaries

- Reports are a placeholder screen; core dashboard metrics are implemented.
- Follow-up tables exist in the schema, but a complete follow-up UI and scheduler are not included yet.
- Campaign creation and lead attachment APIs are included; the UI currently creates and lists campaigns.
- AI voice is wired through Exotel bidirectional media and OpenAI Realtime, but must be tested against your actual Exotel account and applet configuration before enabling.
- Call status callbacks use a secret URL token. Replace or supplement this with the provider's recommended request-signature validation where available.
- The app stores the AI call transcript and can request a post-call summary. Recording storage and transcript retention controls need policy decisions.
