# Security Documentation

## Overview

Democracy OS implements multiple layers of security to protect user privacy, prevent fraud, and maintain data integrity.

## Key Security Features

### 1. Anonymous Voting System

**Threat**: Linking votes to voter identities

**Solution**: Nullifier-based voting

**Implementation**:
```typescript
// User's secret salt (stored encrypted)
const secretSalt = crypto.randomBytes(32).toString('hex');

// Generate nullifier for a specific poll
const nullifier = SHA256(pollId + secretSalt);

// Store vote with nullifier, NOT user ID
INSERT INTO votes (poll_id, nullifier, option_id) VALUES ($1, $2, $3);
```

**Security Properties**:
1. ✅ One vote per user per poll (nullifier uniqueness)
2. ✅ Votes cannot be linked to users (no user_id)
3. ✅ Users can update votes (delete old, insert new)
4. ✅ Results aggregation doesn't expose voters

**Database Verification**:
```sql
-- Votes table has NO user_id column
SELECT * FROM votes;
-- Returns: id, poll_id, nullifier, option_id, vote_timestamp

-- Users table has encrypted secret_salt
SELECT id, email, secret_salt FROM users;
-- secret_salt should be encrypted in production
```

### 2. Authentication Security

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Frontend validation + backend enforcement

**Password Storage**:
```typescript
// NEVER store plain text passwords
const hash = await bcrypt.hash(password, 12); // 12 rounds
```

**Password Verification**:
```typescript
const valid = await bcrypt.compare(plainPassword, storedHash);
```

**JWT Token Security**:

Access Token (Short-lived):
```typescript
{
  userId: "uuid",
  tenantId: "uuid",
  role: "citizen",
  type: "access",
  exp: Date.now() + 15 * 60 * 1000 // 15 minutes
}
```

Refresh Token (Long-lived):
```typescript
{
  userId: "uuid",
  tenantId: "uuid",
  role: "citizen",
  type: "refresh",
  exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
}
```

**Token Storage**:
```typescript
// HTTP-only cookies (not accessible to JavaScript)
res.cookie('accessToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 15 * 60 * 1000
});
```

### 3. Authorization & Access Control

**Role-Based Access Control (RBAC)**:

```typescript
enum UserRole {
  CITIZEN = 'citizen',           // Vote, comment, view
  ELECTED_OFFICIAL = 'elected_official', // + Create commitments
  ADMINISTRATION = 'administration'      // + Manage tenants
}
```

**Middleware Chain**:
```typescript
router.post('/commitments',
  authenticate,                        // Verify JWT
  requireRole(['elected_official']),   // Check role
  handler                               // Execute
);
```

**Tenant Isolation**:
```typescript
// Every query scoped to tenant
WHERE tenant_id = $1 AND ...
```

### 4. Input Validation & Sanitization

**Validation Layers**:

1. **Frontend Validation** (UX)
```typescript
<input
  type="email"
  required
  pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
/>
```

2. **Backend Validation** (Security)
```typescript
body('email').isEmail().normalizeEmail()
body('title').trim().isLength({ min: 5, max: 500 })
body('optionId').isUUID()
```

**SQL Injection Prevention**:
```typescript
// ✅ GOOD - Parameterized queries
db.query('SELECT * FROM polls WHERE id = $1', [pollId]);

// ❌ BAD - String concatenation
db.query(`SELECT * FROM polls WHERE id = '${pollId}'`);
```

**XSS Prevention**:
- React automatically escapes output
- Content Security Policy headers
- No dangerouslySetInnerHTML

### 5. Rate Limiting

**Tiered Limits**:

```typescript
// General API: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Authentication: 5 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts'
});

// Voting: 10 votes per minute per user
const voteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});

// Comments: 5 comments per minute per user
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5
});
```

**Redis-based Custom Limiting**:
```typescript
const key = `rate:${userId}:vote`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 60);
if (count > 10) throw new Error('Rate limit exceeded');
```

### 6. CSRF Protection

**SameSite Cookies**:
```typescript
sameSite: 'strict' // Blocks cross-site requests
```

**Token-based (Future)**:
```typescript
// CSRF token in form
<input type="hidden" name="_csrf" value={csrfToken} />

// Validate on backend
if (req.body._csrf !== req.session.csrfToken) {
  throw new Error('Invalid CSRF token');
}
```

### 7. Security Headers

**Helmet.js Configuration**:
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
```

**Headers Set**:
- `X-Frame-Options: DENY` (prevent clickjacking)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HTTPS enforcement)
- `Content-Security-Policy` (XSS protection)

### 8. Audit Trail & Integrity

**Hash Chain Implementation**:

```typescript
// Event 1 (first event)
event1 = {
  payload: {...},
  payload_hash: SHA256(payload),
  previous_event_hash: null
}

// Event 2
event2 = {
  payload: {...},
  payload_hash: SHA256(payload),
  previous_event_hash: SHA256(event1.previous_event_hash + event1.payload_hash)
}

// Event 3
event3 = {
  payload: {...},
  payload_hash: SHA256(payload),
  previous_event_hash: SHA256(event2.previous_event_hash + event2.payload_hash)
}
```

**Verification**:
```typescript
function verifyHashChain(events) {
  for (let i = 0; i < events.length; i++) {
    if (i === 0) {
      // First event must have null previous hash
      if (events[i].previous_event_hash !== null) return false;
    } else {
      // Verify link to previous event
      const expected = generateChainHash(
        events[i-1].payload_hash,
        events[i-1].previous_event_hash
      );
      if (events[i].previous_event_hash !== expected) return false;
    }
  }
  return true;
}
```

**Properties**:
- ✅ Tamper-evident (any change breaks chain)
- ✅ Append-only (cannot delete past events)
- ✅ Verifiable (public verification endpoint)

### 9. Multi-Tenant Security

**Isolation Mechanisms**:

1. **Database-level**:
```sql
-- Every query scoped to tenant
SELECT * FROM polls WHERE tenant_id = $1 AND id = $2;

-- User-tenant binding
UNIQUE(tenant_id, email)
```

2. **Application-level**:
```typescript
// Middleware extracts tenant
req.tenant = await getTenant(req.headers['x-tenant-slug']);

// All queries filtered
WHERE tenant_id = req.tenant.id
```

3. **User-level**:
```typescript
// Users belong to single tenant
if (req.user.tenantId !== targetTenantId) {
  throw new ForbiddenError();
}
```

### 10. Data Protection

**Sensitive Data Encryption (Production)**:

```typescript
// Email encryption at rest
const encrypted = encrypt(email, ENCRYPTION_KEY);
INSERT INTO users (email) VALUES ($1);

// Secret salt encryption
const encryptedSalt = encrypt(secretSalt, ENCRYPTION_KEY);
INSERT INTO users (secret_salt) VALUES ($1);
```

**Environment Variables**:
```bash
# NEVER commit these to git
JWT_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-random-key>
DATABASE_PASSWORD=<secure-password>
```

**HTTPS Enforcement**:
```typescript
// Redirect HTTP to HTTPS in production
if (process.env.NODE_ENV === 'production' && !req.secure) {
  return res.redirect('https://' + req.headers.host + req.url);
}
```

## Security Checklist

### Authentication ✅
- [x] Bcrypt password hashing (12 rounds)
- [x] JWT tokens (short access, long refresh)
- [x] HTTP-only secure cookies
- [x] Password strength requirements
- [x] Rate limiting on auth endpoints

### Authorization ✅
- [x] Role-based access control
- [x] Tenant isolation
- [x] Permission middleware
- [x] Resource ownership checks

### Anonymous Voting ✅
- [x] Nullifier-based system
- [x] No user_id in votes table
- [x] Encrypted secret salts
- [x] Vote update mechanism
- [x] Results visibility control

### Input Security ✅
- [x] Frontend validation
- [x] Backend validation
- [x] SQL injection prevention (parameterized queries)
- [x] XSS prevention (React escaping + CSP)
- [x] CSRF protection (SameSite cookies)

### Infrastructure Security ✅
- [x] Security headers (Helmet.js)
- [x] CORS configuration
- [x] Rate limiting (Redis)
- [x] Error handling (no leakage)
- [x] HTTPS in production

### Data Integrity ✅
- [x] Audit trail with hash chain
- [x] Append-only event log
- [x] Integrity verification
- [x] Database transactions

### Monitoring 🔄 (Partial)
- [x] Request logging
- [x] Error logging
- [ ] Security event alerts
- [ ] Intrusion detection

## Threat Model

### Threats Mitigated ✅

1. **Vote Buying/Coercion**
   - Mitigation: Results only visible after voting
   - Note: Users can still prove their vote if coerced

2. **Double Voting**
   - Mitigation: Nullifier uniqueness constraint
   - Status: ✅ Prevented

3. **Vote Linkage**
   - Mitigation: No user_id with votes
   - Status: ✅ Anonymous

4. **SQL Injection**
   - Mitigation: Parameterized queries
   - Status: ✅ Protected

5. **XSS Attacks**
   - Mitigation: React escaping + CSP
   - Status: ✅ Protected

6. **CSRF Attacks**
   - Mitigation: SameSite cookies
   - Status: ✅ Protected

7. **Brute Force**
   - Mitigation: Rate limiting
   - Status: ✅ Protected

8. **Data Tampering**
   - Mitigation: Hash chain
   - Status: ✅ Detectable

### Known Limitations ⚠️

1. **Vote Coercion**
   - User can prove their vote to attacker
   - Future: Receipt-free voting with ZK proofs

2. **Secret Salt Compromise**
   - If salt leaked, past votes can be linked
   - Mitigation: Encryption at rest

3. **Server Compromise**
   - Full server access reveals all data
   - Future: Hardware security modules (HSM)

4. **Network Surveillance**
   - Vote timing can be monitored
   - Mitigation: HTTPS, VPN, Tor support

## Security Best Practices

### For Developers

1. **Never Log Secrets**
```typescript
// ❌ BAD
console.log('Secret salt:', secretSalt);

// ✅ GOOD
console.log('User created:', userId);
```

2. **Always Validate Input**
```typescript
// ❌ BAD
const pollId = req.params.id;
const poll = await getPoll(pollId);

// ✅ GOOD
const pollId = req.params.id;
if (!isUUID(pollId)) throw new BadRequestError();
const poll = await getPoll(pollId);
```

3. **Use Parameterized Queries**
```typescript
// ❌ BAD
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ GOOD
db.query('SELECT * FROM users WHERE email = $1', [email]);
```

4. **Handle Errors Safely**
```typescript
// ❌ BAD - Leaks stack trace
res.status(500).json({ error: err.stack });

// ✅ GOOD - Generic message
res.status(500).json({ error: 'Internal server error' });
```

### For Operators

1. **Use Environment Variables**
```bash
# Never hardcode secrets
JWT_SECRET=<generate-with-openssl-rand>
DATABASE_PASSWORD=<use-password-manager>
```

2. **Enable HTTPS**
```bash
# Use Let's Encrypt for free SSL
certbot --nginx -d democracy-os.example.com
```

3. **Monitor Logs**
```bash
# Watch for suspicious activity
grep "401" api.log | tail -100
grep "rate limit" api.log | tail -100
```

4. **Regular Backups**
```bash
# Automated PostgreSQL backups
pg_dump democracy_os > backup-$(date +%Y%m%d).sql
```

5. **Update Dependencies**
```bash
# Check for vulnerabilities
pnpm audit
pnpm update
```

## Incident Response

### If Vote Linkage Suspected

1. Check audit logs for anomalies
2. Verify hash chain integrity
3. Review server access logs
4. Consider rotating encryption keys
5. Notify users if breach confirmed

### If Authentication Bypass

1. Immediately revoke all tokens
2. Force password resets
3. Review JWT secret exposure
4. Check for middleware bypasses
5. Patch and redeploy

### If Rate Limit Bypass

1. Check Redis connectivity
2. Review IP spoofing attempts
3. Implement additional layers
4. Block malicious IPs
5. Scale infrastructure if DDoS

## Compliance Considerations

### GDPR (EU)

- ✅ User consent for data collection
- ✅ Right to access data
- ✅ Right to deletion (user accounts)
- ⚠️ Votes cannot be deleted (by design)
- ✅ Data minimization (anonymous voting)

### Data Retention

- User data: Retained until account deletion
- Votes: Permanent (anonymous)
- Audit logs: 7 years (configurable)
- Comments: Retained (can be edited/deleted)

## Security Roadmap

### Phase 2 (Future)

- [ ] Zero-knowledge proofs for voting
- [ ] Hardware security modules (HSM)
- [ ] End-to-end encryption for messages
- [ ] Multi-factor authentication (MFA)
- [ ] Biometric authentication (mobile)
- [ ] Advanced anomaly detection
- [ ] Blockchain anchoring

### Continuous Improvements

- [ ] Regular penetration testing
- [ ] Bug bounty program
- [ ] Security audits (quarterly)
- [ ] Dependency updates (automated)
- [ ] Security training for developers

## Conclusion

Democracy OS implements robust security measures appropriate for an MVP civic engagement platform. The anonymous voting system balances privacy with accountability, while multiple defense layers protect against common attacks.

For production deployment, additional hardening is recommended (HSM, advanced monitoring, professional audit).

**Security is an ongoing process, not a one-time implementation.**
