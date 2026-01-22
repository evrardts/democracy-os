# Vercel Deployment Guide

This guide walks you through deploying Democracy OS to Vercel with Neon (PostgreSQL) and Upstash (Redis).

## Prerequisites

- GitHub account with the repository pushed
- Vercel account (https://vercel.com)
- Neon account (https://neon.tech)
- Upstash account (https://upstash.com)

## Step 1: Set Up Neon Database

1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project
3. Copy the connection string (it looks like: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`)
4. Run the database migrations:

```bash
# Using psql with your Neon connection string
psql "YOUR_NEON_CONNECTION_STRING" -f packages/database/src/migrations/001_initial_schema.sql
psql "YOUR_NEON_CONNECTION_STRING" -f packages/database/src/migrations/002_multi_stage_consultations.sql
psql "YOUR_NEON_CONNECTION_STRING" -f packages/database/src/migrations/003_documents.sql
psql "YOUR_NEON_CONNECTION_STRING" -f packages/database/src/migrations/004_moderation.sql
```

5. Create a default tenant:

```sql
INSERT INTO tenants (id, name, slug, domain)
VALUES (gen_random_uuid(), 'My Municipality', 'default', 'your-domain.vercel.app');
```

## Step 2: Set Up Upstash Redis

1. Go to [Upstash Console](https://console.upstash.com)
2. Create a new Redis database
3. Copy the Redis URL (it looks like: `rediss://default:xxx@xxx.upstash.io:6379`)

## Step 3: Deploy API to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure the project:
   - **Root Directory**: `apps/api`
   - **Framework Preset**: Other
   - **Build Command**: `cd ../.. && pnpm install && pnpm run build`
   - **Output Directory**: (leave empty)
   - **Install Command**: `cd ../.. && pnpm install`

5. Add Environment Variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon connection string |
| `DATABASE_HOST` | (extracted from Neon URL) |
| `DATABASE_PORT` | `5432` |
| `DATABASE_NAME` | `neondb` (or your DB name) |
| `DATABASE_USER` | (from Neon) |
| `DATABASE_PASSWORD` | (from Neon) |
| `REDIS_URL` | Your Upstash Redis URL |
| `JWT_SECRET` | Generate a secure random string (32+ chars) |
| `ENCRYPTION_KEY` | Generate a secure random string (32 chars) |
| `FRONTEND_URL` | Your frontend Vercel URL (e.g., `https://democracy-os-web.vercel.app`) |
| `NODE_ENV` | `production` |

6. Click "Deploy"

## Step 4: Deploy Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import the same GitHub repository
4. Configure the project:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js
   - **Build Command**: `cd ../.. && pnpm install && pnpm run build --filter=@democracy-os/web`
   - **Install Command**: `cd ../.. && pnpm install`

5. Add Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Your API Vercel URL (e.g., `https://democracy-os-api.vercel.app`) |
| `NEXT_PUBLIC_APP_NAME` | `Democracy OS` |

6. Click "Deploy"

## Step 5: Update CORS

After both deployments, update the API's `FRONTEND_URL` environment variable with the actual frontend URL.

## Step 6: Configure Custom Domain (Optional)

1. In Vercel project settings, go to "Domains"
2. Add your custom domain
3. Follow Vercel's DNS configuration instructions

## Environment Variables Reference

### API Environment Variables

```env
# Database (Neon)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
DATABASE_HOST=ep-xxx.region.aws.neon.tech
DATABASE_PORT=5432
DATABASE_NAME=neondb
DATABASE_USER=your-user
DATABASE_PASSWORD=your-password

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Security
JWT_SECRET=your-super-secure-random-string-at-least-32-chars
ENCRYPTION_KEY=your-32-character-encryption-key

# CORS
FRONTEND_URL=https://your-frontend.vercel.app

# Environment
NODE_ENV=production
```

### Frontend Environment Variables

```env
NEXT_PUBLIC_API_URL=https://your-api.vercel.app
NEXT_PUBLIC_APP_NAME=Democracy OS
```

## Troubleshooting

### Database Connection Errors

- Ensure your Neon database allows connections from Vercel's IP ranges
- Check that SSL mode is enabled in your connection string (`?sslmode=require`)

### Redis Connection Errors

- Upstash URLs start with `rediss://` (with double 's' for TLS)
- Ensure you're using the correct password from Upstash console

### Build Errors

- Make sure all workspace packages are built: `pnpm run build`
- Check that TypeScript has no errors: `pnpm run lint`

### CORS Errors

- Update `FRONTEND_URL` in the API project to match your actual frontend URL
- Ensure both URLs use HTTPS in production

## Security Checklist

- [ ] Generate unique, strong JWT_SECRET (use `openssl rand -base64 32`)
- [ ] Generate unique ENCRYPTION_KEY (use `openssl rand -hex 16`)
- [ ] Never commit `.env` files to git
- [ ] Enable Vercel's environment variable encryption
- [ ] Set up Neon IP allowlist if needed
- [ ] Review and test all API endpoints with authentication
