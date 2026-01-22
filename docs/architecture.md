# Democracy OS - Architecture Overview

## System Architecture

Democracy OS is built as a monorepo with clear separation between frontend, backend, and shared packages.

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (Next.js 14 / React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Pages   │  │Components│  │  Stores  │  │   Hooks  │  │
│  │          │  │          │  │ (Zustand)│  │  (React) │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│         │              │              │              │      │
│         └──────────────┴──────────────┴──────────────┘      │
│                         │                                    │
│                   API Client                                 │
└─────────────────────────┼───────────────────────────────────┘
                          │
                    HTTPS / REST API
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                         │                                    │
│                    Express.js                                │
│                         │                                    │
│  ┌──────────┬──────────┴──────────┬──────────┬──────────┐  │
│  │  Routes  │   Middleware        │ Services │  Utils   │  │
│  │          │ - Auth              │          │          │  │
│  │  - Auth  │ - Rate Limit        │ - Vote   │ - JWT    │  │
│  │  - Polls │ - Validation        │ - Poll   │ - Crypto │  │
│  │  - Votes │ - Error Handler     │ - User   │ - Redis  │  │
│  │  - Comm. │ - Tenant            │ - Audit  │          │  │
│  └──────────┴─────────────────────┴──────────┴──────────┘  │
│         │              │                  │                  │
│         └──────────────┴──────────────────┘                  │
│                         │                                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    PostgreSQL         Redis           MinIO
  (Primary DB)      (Cache/Rate)    (S3 Storage)
```

## Core Components

### 1. Frontend (apps/web)

**Technology**: Next.js 14 with App Router

**Key Features**:
- Server-side rendering (SSR) for SEO
- Client-side navigation
- Optimistic UI updates
- React Query for data fetching

**State Management**:
- **Zustand**: Global auth state
- **React Query**: Server state & caching
- **React Context**: Theme, i18n (future)

**Pages**:
```
/                   → Landing page
/login              → Authentication
/register           → User registration
/polls              → Poll listing
/polls/[id]         → Poll detail + voting
/polls/create       → Create new poll
/commitments        → Government commitments
/profile            → User profile
```

### 2. Backend (apps/api)

**Technology**: Express.js with TypeScript

**Architecture Layers**:

1. **Routes Layer**
   - Define API endpoints
   - Request validation
   - Response formatting

2. **Middleware Layer**
   - Authentication (JWT)
   - Authorization (RBAC)
   - Rate limiting
   - Error handling
   - Request logging

3. **Service Layer**
   - Business logic
   - Data transformation
   - Cryptographic operations

4. **Data Layer**
   - Database queries
   - Transaction management
   - Cache operations

### 3. Shared Packages

**@democracy-os/shared**
- TypeScript interfaces
- Enums
- API types
- Validation schemas

**@democracy-os/crypto**
- Nullifier generation
- Hash chain operations
- Cryptographic utilities

**@democracy-os/database**
- Database client
- Migration runner
- Query helpers

## Data Flow

### Anonymous Voting Flow

```
1. User clicks "Vote"
   ↓
2. Frontend sends vote with optionId
   ↓
3. API authenticates user (JWT)
   ↓
4. Backend retrieves user's secret_salt
   ↓
5. Generate nullifier = SHA256(pollId + secret_salt)
   ↓
6. Check if nullifier exists in votes table
   ↓
   ├─ Exists: Update vote (create new row, delete old)
   │
   └─ New: Insert vote with nullifier
   ↓
7. Return success
   ↓
8. Frontend fetches results
   ↓
9. Backend aggregates votes by option_id
   ↓
10. Return results (only if user voted)
```

**Key Security Principle**: The user's ID is never stored with the vote. Only the nullifier is stored, making votes unlinkable to users while preventing double voting.

### Multi-Tenant Isolation

```
Request → Extract tenant from header/path
         ↓
      Middleware validates tenant exists
         ↓
      Inject tenantId into request context
         ↓
      All queries filtered by tenant_id
         ↓
      Response scoped to tenant
```

**Isolation Mechanisms**:
1. Database-level: WHERE tenant_id = $1
2. Application-level: Middleware injection
3. User-level: Users belong to single tenant

## Database Design

### Key Tables

**tenants**
- Stores municipality/organization info
- Contains settings (JSONB)
- Enables multi-tenancy

**users**
- Standard user fields
- Encrypted secret_salt for nullifiers
- Belongs to one tenant
- UNIQUE(tenant_id, email)

**polls**
- Poll metadata
- Options stored as JSONB array
- Status: draft, active, closed

**votes**
- Anonymous voting
- Uses nullifier (hash)
- UNIQUE(poll_id, nullifier) prevents double voting
- No user_id column!

**audit_events**
- Append-only event log
- Hash chain for tamper detection
- Links: previous_event_hash

### Indexing Strategy

**Performance Indexes**:
- `idx_polls_tenant_id` - Fast tenant queries
- `idx_votes_poll_id` - Vote aggregation
- `idx_votes_nullifier` - Double-vote prevention

**Security Indexes**:
- `idx_users_email` - Login performance
- `idx_audit_events_created_at` - Chronological access

## Security Architecture

### Authentication Flow

```
1. User submits email/password
   ↓
2. Backend validates credentials
   ↓
3. Generate JWT tokens:
   - Access token (15 min)
   - Refresh token (7 days)
   ↓
4. Store in HTTP-only cookies
   ↓
5. Client includes cookies in requests
   ↓
6. Middleware verifies token
   ↓
7. Inject user context
```

### Authorization Model

**Roles**:
- **Citizen**: Vote, comment, view
- **Elected Official**: Create commitments, all citizen rights
- **Administration**: Manage tenants, all rights

**Permission Checks**:
```typescript
// Middleware chain
authenticate → requireRole(['elected_official']) → handler
```

### Cryptographic Security

**Password Storage**:
```
plaintext → bcrypt(12 rounds) → hash → database
```

**Nullifier Generation**:
```
SHA256(pollId + userSecretSalt) → nullifier
```

**Audit Trail**:
```
event_1_hash → event_2_hash → event_3_hash → ...
     ↓              ↓              ↓
  SHA256(        SHA256(        SHA256(
   payload)    prev + payload) prev + payload)
```

### Rate Limiting

**Tiers**:
1. **Global API**: 100 req/15min per IP
2. **Auth endpoints**: 5 req/15min per IP
3. **Voting**: 10 votes/min per user
4. **Comments**: 5 comments/min per user

**Implementation**: Redis-based counters with sliding windows

## Scalability Considerations

### Current MVP Architecture

- Single API server
- Single PostgreSQL instance
- Single Redis instance
- Suitable for 10,000+ concurrent users per tenant

### Future Scaling Path

**Horizontal Scaling**:
```
Load Balancer
     ↓
 ┌───┴───┬───────┬───────┐
API-1  API-2  API-3  API-N
 └───┬───┴───────┴───────┘
     ↓
PostgreSQL Primary
     ↓
Read Replicas (for queries)
```

**Caching Strategy**:
1. Poll metadata → Redis (1 hour)
2. Results (closed polls) → Redis (permanent)
3. User sessions → Redis (15 min)

**Database Optimization**:
1. Connection pooling (20 connections)
2. Query optimization
3. Materialized views for analytics
4. Partitioning by tenant_id (future)

## Monitoring & Observability

### Logging

**Levels**:
- ERROR: System failures
- WARN: Business rule violations
- INFO: Request/response
- DEBUG: Development only

**Structured Logging**:
```json
{
  "timestamp": "2024-01-16T10:30:00Z",
  "level": "INFO",
  "service": "api",
  "event": "vote_cast",
  "pollId": "uuid",
  "nullifier": "hash",
  "duration": 45
}
```

### Health Checks

**Endpoints**:
- `GET /health` - Basic health
- `GET /health/db` - Database connectivity
- `GET /health/redis` - Redis connectivity

### Metrics (Future)

- Request rate
- Response time (p50, p95, p99)
- Error rate
- Vote throughput
- Active users

## Deployment Architecture

### Development

```
Local Machine
├── apps/web (localhost:3000)
├── apps/api (localhost:3001)
└── Docker Compose
    ├── PostgreSQL (5432)
    ├── Redis (6379)
    └── MinIO (9000)
```

### Production (Recommended)

```
CDN (CloudFlare)
     ↓
Frontend (Vercel/Netlify)
     ↓
API (Cloud Run/ECS)
     ↓
     ├── PostgreSQL (RDS/Cloud SQL)
     ├── Redis (ElastiCache/MemoryStore)
     └── S3 (AWS/GCS)
```

## Technology Decisions

### Why Next.js?

- SSR for SEO and initial load
- File-based routing
- API routes (optional)
- Great DX with hot reload
- Production-ready

### Why Express.js?

- Mature and stable
- Extensive middleware ecosystem
- Simple and flexible
- Great TypeScript support
- Easy to scale

### Why PostgreSQL?

- ACID compliance (critical for voting)
- JSON support (for flexible options)
- Excellent performance
- Rich indexing
- Strong community

### Why Redis?

- Fast in-memory cache
- Rate limiting support
- Session storage
- Pub/sub (future real-time)

### Why Nullifier-based Voting?

- Privacy-preserving
- Prevents double voting
- Allows vote updates
- No complex ZK proofs needed (MVP)
- Upgradeable to full ZK later

## Future Enhancements

### Phase 2

1. **Zero-Knowledge Proofs**
   - Replace nullifiers with ZK-SNARKs
   - Merkle tree membership proofs
   - Full cryptographic anonymity

2. **Real-time Updates**
   - WebSocket connections
   - Live result updates
   - Notification system

3. **Advanced Moderation**
   - AI-based content filtering
   - Moderator dashboard
   - Appeal system

### Phase 3

1. **Mobile Apps**
   - React Native
   - Push notifications
   - Offline voting

2. **Analytics Dashboard**
   - Voting trends
   - Participation metrics
   - Demographic insights

3. **Integration APIs**
   - eID authentication
   - Government databases
   - Blockchain anchoring

## Conclusion

Democracy OS is architected for:
- **Privacy**: Anonymous voting with cryptographic guarantees
- **Security**: Multiple layers of protection
- **Scalability**: Ready to grow with demand
- **Maintainability**: Clean separation of concerns
- **Extensibility**: Easy to add features

The architecture balances simplicity (for MVP) with future-proofing (for scale).
