# LeadFlow — AWS RDS + JavaScript / JSX (No Docker)

LeadFlow is a multi-tenant lead management and AI-assisted calling workspace.
It uses readable JavaScript and JSX, a Node.js / Express API, Amazon RDS for
PostgreSQL, custom JWT authentication, and server-side AI / telephony integrations.

**Docker is not required or used anywhere in this project.** Install Node.js and
PostgreSQL directly on your computer for local development, or connect the API
to Amazon RDS. The browser never connects directly to the database.

> This is an application foundation. Complete the checks in
> `docs/PRODUCTION_CHECKLIST.md` and test provider integrations before handling
> real customer data or making live calls.

## Technology

- Frontend: React 18, Vite, JSX, React Router, Lucide icons
- Backend: Node.js 22+, Express, JavaScript ES modules
- Database: Amazon RDS PostgreSQL 15+ (local PostgreSQL for development)
- Authentication: bcrypt password hashes + signed JWTs
- Tenant isolation: PostgreSQL Row Level Security + transaction-local tenant context
- AI: OpenAI for lead scoring and call summaries
- AI voice: Exotel bidirectional AgentStream + OpenAI Realtime WebSocket

## Repository structure

```text
leadflow-rds/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   ├── pages/
│   │   └── styles.css
│   └── package.json
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
├── database/
│   ├── migrations/
│   └── create_app_role.sql
├── deploy/aws/
├── docs/
└── package.json
```

## 1. Prerequisites

Install these directly on Windows, macOS or Linux:

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 15 or newer (only if running a local database)
- pgAdmin or DBeaver (optional, for visual SQL management)
- Git (optional)

Useful downloads:

- Node.js: https://nodejs.org/
- PostgreSQL: https://www.postgresql.org/download/
- pgAdmin: https://www.pgadmin.org/download/
- DBeaver: https://dbeaver.io/download/

## 2. Install dependencies

Open a terminal in the project root:

```bash
npm install
```

Copy the environment examples.

**Windows PowerShell:**

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

**macOS / Linux:**

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Generate a strong JWT secret.

**Windows PowerShell:**

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**macOS / Linux:**

```bash
openssl rand -base64 48
```

Put the generated value in `server/.env` as `JWT_SECRET`. Do not use the example
placeholder or commit the `.env` file.

## 3. Set up local PostgreSQL (no Docker)

1. Install PostgreSQL using the official installer for your operating system.
2. During installation, remember the password for the PostgreSQL `postgres` user.
3. Open pgAdmin or DBeaver and connect to your local PostgreSQL server.
4. Create a database named `leadflow`.
5. Open `server/.env` and set the local connection string:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/leadflow
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_PATH=
```

Replace `YOUR_PASSWORD` with the password you chose during installation. If it
contains URL-reserved characters, URL-encode the password before placing it in
the connection string.

Run the schema migrations from the project root:

```bash
npm run db:migrate
```

For local development, the migration owner can run the application. For AWS,
create the dedicated `leadflow_app` role using `database/create_app_role.sql`
and use that least-privilege role for the running API.

### If PostgreSQL is already installed

You do not need to reinstall it. Just create the `leadflow` database in pgAdmin
or run this command in SQL Shell (`psql`):

```sql
CREATE DATABASE leadflow;
```

## 4. Start the application

From the project root:

```bash
npm run dev
```

- React frontend: http://localhost:5173
- Express API: http://localhost:4000
- Health check: http://localhost:4000/api/health

Create a workspace from the registration screen. The registration flow creates
the first user as the workspace owner. The generated workspace slug is needed
for later sign-ins and is returned in the registration response.

## 5. CSV import format

CSV headers accepted:

```csv
firstName,lastName,company,email,phone,source,notes
Aarav,Sharma,Example Pvt Ltd,aarav@example.com,+919876543210,website,Asked for a demo
```

The API accepts up to 5,000 rows / 5 MB per import and skips invalid or duplicate
phone numbers. Phone normalisation removes spaces, brackets, dots and dashes;
normalise imported phone numbers to E.164 format for best results.

## 6. AWS RDS PostgreSQL

Follow `deploy/aws/RDS_SETUP.md` for the AWS console setup, private networking,
TLS certificate, schema migration and least-privilege database user.

Production database environment example:

```env
DATABASE_URL=postgresql://leadflow_app:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/leadflow
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_PATH=/etc/ssl/certs/global-bundle.pem
```

Keep RDS private. Allow TCP 5432 only from the application server's security
group. Never expose the database to `0.0.0.0/0`.

## 7. AI features

Set `OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_REALTIME_MODEL` in the server
environment. AI lead scoring and call summarisation run on the server. Never put
an OpenAI API key in a `VITE_` variable or browser code.

## 8. AI calling setup

AI calling is disabled by default. To enable it, you need:

1. An Exotel account approved for your intended use, API key, API token, Account SID,
   and an ExoPhone caller ID.
2. A public HTTPS API origin and WSS media endpoint. Set `PUBLIC_API_URL` to it.
3. A reachable `/media` WebSocket endpoint.
4. An OpenAI API key with Realtime API access.
5. `EXOTEL_WEBHOOK_SECRET`, a long random secret used to authenticate the status callback.
6. Explicit, documented consent for AI voice calls, valid for the intended purpose.
7. Confirmation that the calling flow, number series, consent, calling windows,
   suppression and all telecom obligations are approved for your business.

For the Mumbai cluster, set `EXOTEL_SUBDOMAIN=api.in.exotel.com`. The Singapore
cluster uses `api.exotel.com`. Follow your Exotel account's assigned cluster.

Only after validating the provider account and webhook flow should you set:

```env
CALLING_ENABLED=true
EXOTEL_ACCOUNT_SID=...
EXOTEL_API_KEY=...
EXOTEL_API_TOKEN=...
EXOTEL_SUBDOMAIN=api.in.exotel.com
EXOTEL_CALLER_ID=...
EXOTEL_WEBHOOK_SECRET=...
PUBLIC_API_URL=https://api.yourdomain.com
OPENAI_API_KEY=...
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
```

The UI records consent only when an agent confirms they have evidence. It does not
collect consent from the lead itself. The organisation remains responsible for
valid consent capture, opt-out handling, suppression lists and compliance with
applicable telecom / privacy laws. Do not use this application for unsolicited
bulk calling.

## 9. Build and code quality

```bash
npm run build
npm run lint
npm run format
```

The frontend production build is emitted to `client/dist`.

## 10. Deploy without Docker

For AWS, run Node.js directly on an EC2 instance using `systemd` to keep the API
running. Use Nginx as a reverse proxy for HTTPS and WebSocket traffic. The
step-by-step guide and example service unit are in `deploy/aws/APP_DEPLOYMENT.md`
and `deploy/aws/leadflow-api.service.example`.

The static React build can be hosted on AWS Amplify Hosting or S3 + CloudFront.

## 11. Security notes

- Passwords are hashed using bcrypt; plaintext passwords are never stored.
- JWTs are signed and checked server-side.
- API routes require a valid JWT and organization membership.
- Tenant tables use RLS and transaction-local tenant context.
- The application database role must not own the tables and must not have `BYPASSRLS`.
- API secrets belong only in server-side environment variables / Secrets Manager.
- Do not enable public RDS access.
- Use HTTPS in production; use a trusted AWS RDS CA bundle for PostgreSQL TLS.
- Configure log retention, backups, alerts and incident response before launch.

See `docs/PRODUCTION_CHECKLIST.md` for remaining launch checks.
#   l e a d g e n _ a i  
 