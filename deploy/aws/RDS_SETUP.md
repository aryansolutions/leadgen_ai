# Amazon RDS PostgreSQL setup (Mumbai)

This project uses Amazon RDS for PostgreSQL and a separate, least-privilege
`leadflow_app` database role. The browser must never connect directly to RDS.

## 1. Check your AWS Free Tier / credits first

AWS changed its Free Tier programme for accounts created from 15 July 2025.
The RDS offer currently lists PostgreSQL on `db.t3.micro` or `db.t4g.micro`.
New Free Plan accounts can explore eligible RDS resources for up to six months;
Paid Plan users consume eligible credits. Older accounts may have legacy terms.
Check the Free Tier panel in your own AWS Billing console before provisioning.

Do not assume RDS is free indefinitely. Instance hours, storage, backups,
provisioned IOPS, snapshots, data transfer, public IPv4 and other resources can
create charges. Set a budget alert before creating anything.

Official references:
- https://aws.amazon.com/rds/free/
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html
- https://aws.amazon.com/rds/pricing/

## 2. Set a budget alert

1. Open AWS Billing and Cost Management.
2. Open Budgets and create a monthly cost budget.
3. Set a small alert threshold suitable for your account.
4. Add an email address that you check.
5. Also review Free Tier usage and Cost Explorer regularly.

A budget alert is not a hard spending cap and does not automatically stop resources.

## 3. Create the database

1. Open https://console.aws.amazon.com/rds/.
2. Select Asia Pacific (Mumbai), `ap-south-1`.
3. Choose Databases → Create database.
4. Select PostgreSQL.
5. Choose the Free tier / Sandbox option shown as eligible for your account.
6. Select an eligible `db.t3.micro` or `db.t4g.micro` class shown by the console.
7. Choose Single-AZ for this development environment.
8. Set a database identifier such as `leadflow-db`.
9. Set the master username and a unique, strong password. Store it in a password manager.
10. Choose a small storage allocation within the Free Tier / credit allowance shown to you.
11. Disable public access.
12. Choose a VPC and DB subnet group in the same VPC as the future application server.
13. Create a dedicated security group for RDS.
14. Create the database and wait until its status is Available.

Do not select Multi-AZ, provisioned IOPS, extra replicas or a larger instance for
this initial trial environment unless you have checked the price first.

## 4. Network access (important)

Keep RDS private. Do not add `0.0.0.0/0` to port 5432.

Create or select an application-server security group, for example
`leadflow-app-sg`. In the RDS security group, add one inbound rule:

- Type: PostgreSQL
- Protocol: TCP
- Port: 5432
- Source: the application server security group `leadflow-app-sg`

Do not use your home IP as the production database rule. If you need to run
migrations from your laptop, use an SSH/SSM tunnel through a controlled EC2
instance in the same VPC, or temporarily use a tightly restricted IP rule and
remove it immediately afterward.

AWS guide:
https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_SettingUp.html

## 5. Create the database and application user

Connect to the RDS instance using the master user from an EC2 instance in the
same VPC, or through a secure tunnel. Use `psql`, pgAdmin or DBeaver.

Create the database if the RDS setup did not already create it:

```sql
CREATE DATABASE leadflow;
```

Connect to `leadflow`, then run the project migration as the master user:

```bash
cd leadflow-rds
cp server/.env.example server/.env
# Set DATABASE_URL to the RDS master connection temporarily.
# Set DATABASE_SSL=true and provide the AWS RDS CA bundle path.
npm install
npm run db:migrate
```

After the migration, run `database/create_app_role.sql` as the master user.
Replace `REPLACE_WITH_A_LONG_RANDOM_PASSWORD` first. The application must use
`leadflow_app`, not the RDS master account.

The migration enables PostgreSQL Row Level Security on tenant-owned tables.
The API sets transaction-local organization context for each tenant query.
The app role is deliberately not the table owner and does not have BYPASSRLS.

## 6. Configure TLS

Download the current AWS RDS CA bundle from the official AWS trust store:
https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

Set the backend environment:

```env
DATABASE_URL=postgresql://leadflow_app:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/leadflow
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_PATH=/etc/leadflow/certs/global-bundle.pem
```

Use URL-encoded database passwords if they contain special characters.
Do not turn off certificate verification in production.

## 7. Verify the connection

From the backend host:

```bash
psql "host=YOUR_RDS_ENDPOINT port=5432 dbname=leadflow user=leadflow_app sslmode=verify-full sslrootcert=global-bundle.pem"
```

Then start the API and check:

```bash
curl https://YOUR_API_DOMAIN/api/health
```

Expected response:

```json
{"status":"ok","database":"connected"}
```

## 8. Operational safeguards

- Use the app DB user in the API, never the master user.
- Keep the RDS endpoint private and limit inbound access to the app security group.
- Keep `DATABASE_SSL=true` and verify the CA.
- Back up the database before schema changes.
- Enable deletion protection for a production database.
- Configure backup retention appropriate to the data and your budget.
- Keep secrets in AWS Secrets Manager or SSM Parameter Store in production.
- Do not store call recordings in PostgreSQL; store them in a private S3 bucket.
- Review RDS, EC2, NAT Gateway, load balancer, IPv4 and storage charges separately.
