# API overview

All authenticated routes require:

```http
Authorization: Bearer <jwt>
X-Organization-Id: <organization UUID>
```

## Public authentication

- `POST /api/auth/register` — create a workspace and owner.
- `POST /api/auth/login` — sign in using email, password and workspace slug.
- `GET /api/health` — API and database health.

## Leads

- `GET /api/leads?search=&status=&page=&limit=`
- `POST /api/leads`
- `PATCH /api/leads/:id`
- `DELETE /api/leads/:id`
- `POST /api/leads/import` — multipart field `file`.
- `POST /api/leads/:id/consent` — append a consent record.

## Dashboard and campaigns

- `GET /api/dashboard/summary`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `POST /api/campaigns/:campaignId/leads` — JSON `{ "leadIds": ["uuid"] }`.

## AI and calling

- `POST /api/ai/leads/:leadId/score`
- `GET /api/calling`
- `POST /api/calling/start/:leadId` — JSON `{ "callerId": "optional approved ExoPhone" }`.
- `POST /api/ai/calls/:callId/summarize`
- `POST /api/webhooks/exotel/:organizationId/:callId?token=...` — provider callback.
- `wss://<api-host>/media?token=...` — short-lived Exotel media bridge token.
