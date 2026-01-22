# Democracy OS - Civic Transparency and Voting Platform MVP

A modern, privacy-preserving platform for democratic participation featuring anonymous voting, transparent government commitments tracking, and community engagement.

## Features

### ✅ Implemented (MVP)

- **Anonymous Voting System**
  - Cryptographic nullifier-based voting (one person = one vote)
  - Vote updates allowed without exposing identity
  - Results visible only after voting
  - Privacy-preserving architecture

- **Multi-Tenant Architecture**
  - Complete tenant isolation
  - Support for multiple municipalities
  - Tenant-specific data separation

- **Authentication & Authorization**
  - Secure JWT-based authentication
  - Role-based access control (Citizen, Elected Official, Administration)
  - HTTP-only cookies for token storage
  - Password strength requirements

- **Poll Management**
  - Create, update, and manage polls
  - Multiple poll options
  - Draft, active, and closed statuses
  - Tags for organization

- **Comments System**
  - Comment on polls with full edit history
  - Upvote/downvote functionality
  - Comment reporting for moderation
  - Automatic de-ranking of reported comments

- **Transparency Module**
  - Government commitments tracking
  - Full version history (append-only)
  - Budget tracking
  - Status updates (planned, in-progress, delivered, cancelled)

- **Audit Trail**
  - Tamper-resistant hash chain
  - Complete event logging
  - Integrity verification endpoint

## Technology Stack

### Backend
- **Node.js 20+** with TypeScript
- **Express.js** for API
- **PostgreSQL 15** for database
- **Redis** for caching and rate limiting
- **@noble/hashes** for cryptography
- **bcrypt** for password hashing
- **jsonwebtoken** for JWT auth

### Frontend
- **Next.js 14** (App Router)
- **React 18** with TypeScript
- **TailwindCSS** for styling
- **Zustand** for state management
- **React Query** for data fetching

### Infrastructure
- **Docker** & Docker Compose
- **pnpm** for package management
- **MinIO** for S3-compatible storage

## Project Structure

```
democracy-os/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # Next.js app router pages
│   │   │   ├── components/    # React components
│   │   │   └── lib/           # Client utilities
│   │   └── public/
│   └── api/                    # Node.js backend
│       ├── src/
│       │   ├── services/      # Business logic
│       │   ├── routes/        # API endpoints
│       │   ├── middleware/    # Express middleware
│       │   ├── models/        # Database models
│       │   └── utils/         # Backend utilities
│       └── tests/
├── packages/
│   ├── shared/                # Shared types & utilities
│   ├── crypto/                # Cryptographic utilities
│   └── database/              # Database schemas & migrations
└── docker/
    └── docker-compose.yml
```

## Prerequisites

- **Node.js** 20.x or higher
- **pnpm** 8.x or higher
- **Docker** and Docker Compose (for local development)
- **PostgreSQL 15** (or use Docker)
- **Redis** (or use Docker)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/democracy-os.git
cd democracy-os
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://democracy:democracy@localhost:5432/democracy_os
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=democracy_os
DATABASE_USER=democracy
DATABASE_PASSWORD=democracy

# Redis
REDIS_URL=redis://localhost:6379

# API
API_PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001

# Node environment
NODE_ENV=development
```

### 4. Start infrastructure services

```bash
pnpm docker:up
```

This starts PostgreSQL, Redis, and MinIO in Docker containers.

### 5. Run database migrations

```bash
pnpm db:migrate
```

### 6. Start development servers

In separate terminals:

```bash
# Start API server
pnpm api

# Start frontend
pnpm web
```

Or start both in parallel:

```bash
pnpm dev
```

### 7. Access the application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **API Health Check**: http://localhost:3001/health
- **MinIO Console**: http://localhost:9001

## Usage

### Creating a User

1. Navigate to http://localhost:3000
2. Click "Register"
3. Fill in your details:
   - Display Name (2-100 characters)
   - Email address
   - Password (min 8 chars, must include uppercase, lowercase, and number)
4. Login with your credentials

### Creating a Poll

1. Login to the platform
2. Navigate to "Polls"
3. Click "Create Poll"
4. Fill in poll details:
   - Title (5-500 characters)
   - Description (optional)
   - At least 2 options
   - Tags (optional)
5. Save as draft or publish immediately

### Voting

1. Navigate to an active poll
2. Select your preferred option
3. Click "Submit Vote"
4. View results immediately after voting
5. You can update your vote at any time

### Anonymous Voting Explained

Democracy OS uses a cryptographic nullifier system to ensure:

1. **One Vote Per Person**: Each user can only vote once per poll
2. **Complete Anonymity**: Votes are not linked to user identities
3. **Vote Updates**: Users can change their vote without revealing themselves
4. **No Double Voting**: Nullifiers prevent the same person from voting twice

Technical implementation:
```
nullifier = SHA256(pollId + userSecretSalt)
```

The nullifier is stored with the vote instead of the user ID, making it impossible to link votes to voters while still preventing double voting.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Polls
- `GET /api/polls` - List polls
- `GET /api/polls/:id` - Get poll details
- `POST /api/polls` - Create poll (authenticated)
- `PUT /api/polls/:id` - Update poll (creator only)
- `DELETE /api/polls/:id` - Delete poll (creator only, no votes)

### Voting
- `POST /api/polls/:id/vote` - Submit or update vote
- `GET /api/polls/:id/results` - Get results (must have voted)
- `GET /api/polls/:id/has-voted` - Check if voted

### Comments
- `GET /api/polls/:id/comments` - List comments
- `POST /api/polls/:id/comments` - Create comment
- `PUT /api/comments/:id` - Edit comment
- `POST /api/comments/:id/vote` - Upvote/downvote
- `POST /api/comments/:id/report` - Report comment

### Commitments
- `GET /api/commitments` - List commitments
- `GET /api/commitments/:id` - Get commitment
- `GET /api/commitments/:id/history` - Get version history
- `POST /api/commitments` - Create (officials only)
- `PUT /api/commitments/:id` - Update (creates new version)

### Tenants
- `GET /api/tenants` - List tenants
- `GET /api/tenants/:slug` - Get tenant by slug

### Audit
- `GET /api/audit/events` - Get audit events
- `GET /api/audit/verify` - Verify hash chain integrity

## Testing

### Run all tests

```bash
pnpm test
```

### Run tests for specific package

```bash
pnpm --filter @democracy-os/api test
pnpm --filter @democracy-os/web test
```

## Database Schema

Key tables:
- `tenants` - Multi-tenant isolation
- `users` - User accounts with encrypted secret salts
- `polls` - Poll definitions with options
- `votes` - Anonymous votes with nullifiers
- `comments` - User comments with edit history
- `comment_votes` - Upvotes/downvotes
- `comment_reports` - Moderation reports
- `commitments` - Government commitments with versioning
- `audit_events` - Tamper-resistant event log

See `packages/database/src/migrations/001_initial_schema.sql` for full schema.

## Security Features

### Authentication & Authorization
- JWT tokens with short expiration (15min access, 7d refresh)
- HTTP-only cookies
- CSRF protection
- Role-based access control

### Vote Anonymity
- Nullifier-based vote tracking
- No user ID stored with votes
- Encrypted secret salts at rest
- Separate tables for users and votes

### Data Protection
- Bcrypt password hashing (cost factor 12)
- Helmet.js security headers
- Input validation & sanitization
- Parameterized SQL queries (prevents SQL injection)
- CORS configuration

### Rate Limiting
- Per-IP limits on auth endpoints
- Per-user limits on vote/comment creation
- Redis-based rate limiting

### Audit Trail
- Hash chain for integrity
- Append-only event log
- Public verification endpoint

## Development

### Code Quality

```bash
# Lint all packages
pnpm lint

# Format code
pnpm format

# Type check
pnpm type-check
```

### Database Migrations

Create a new migration:

```bash
# Create migration file in packages/database/src/migrations/
# Name it with incrementing number: 002_your_migration_name.sql

# Run migrations
pnpm db:migrate
```

### Building for Production

```bash
pnpm build
```

## Deployment

### Environment Variables for Production

Ensure you set secure values for:

```env
NODE_ENV=production
JWT_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-random-key>
DATABASE_PASSWORD=<secure-password>
REDIS_PASSWORD=<secure-password>
```

### Docker Production Build

```bash
# Build production images
docker-compose -f docker/docker-compose.prod.yml build

# Start services
docker-compose -f docker/docker-compose.prod.yml up -d
```

## Roadmap (Future Enhancements)

### Phase 2 - Advanced Features
- [ ] Zero-knowledge proofs for voting
- [ ] eID/itsme integration
- [ ] Multi-stage consultations
- [ ] Advanced moderation workflows
- [ ] Blockchain anchoring for audit trail
- [ ] Document upload to S3/MinIO
- [ ] Email notifications
- [ ] Mobile apps (React Native)
- [ ] Internationalization (EN/FR/NL)

### Phase 3 - Scalability
- [ ] Horizontal scaling
- [ ] Read replicas
- [ ] CDN integration
- [ ] WebSocket for real-time updates
- [ ] Performance monitoring

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Email: support@democracy-os.example.com

## Acknowledgments

- Built with transparency and privacy as core principles
- Inspired by democratic values and civic engagement
- Cryptographic design based on nullifier systems used in privacy-preserving voting

---

**Made with ❤️ for democracy and civic participation**
