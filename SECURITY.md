# Security Policy

## Reporting Security Vulnerabilities

We take the security of Democracy OS seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send details to [security@democracy-os.org] (replace with actual email)
2. **GitHub Security Advisories**: Use GitHub's private vulnerability reporting feature

### What to Include

When reporting a vulnerability, please include:

- Type of vulnerability
- Full paths of affected source file(s)
- Location of the affected code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment (what an attacker could achieve)
- Suggested fixes (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Status Updates**: Every 7 days until resolved
- **Resolution**: Depends on severity and complexity

### Security Update Process

1. We will investigate and validate the report
2. We will develop and test a fix
3. We will notify you before public disclosure
4. We will release a security patch
5. We will publicly disclose the vulnerability (after patch is available)

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Security Features

Democracy OS implements multiple security layers to protect user data and ensure system integrity:

### 1. Authentication & Authorization

**Implemented**:
- ✅ JWT tokens with short expiration (15min access, 7d refresh)
- ✅ HTTP-only secure cookies
- ✅ Bcrypt password hashing (cost factor 12)
- ✅ Role-based access control (Citizen, Elected Official, Administration)
- ✅ Tenant-scoped authorization

**Recommendations**:
- Rotate JWT secrets regularly
- Implement password complexity requirements
- Add 2FA/MFA for administrators
- Implement account lockout after failed attempts

### 2. Anonymous Voting Privacy

**Implemented**:
- ✅ Cryptographic nullifiers (SHA-256)
- ✅ Zero linkage between votes and voters
- ✅ Secret salts encrypted at rest
- ✅ No user_id stored in votes table
- ✅ Vote updates preserve anonymity

**Guarantees**:
- Platform administrators cannot link votes to voters
- Database compromise does not reveal who voted for what
- Vote tallies are public, but individual votes are private

**Threat Model**:
- Protected against: Database access, admin abuse, data breaches
- NOT protected against: Coercion while voting, device compromise

### 3. Input Validation & Injection Prevention

**Implemented**:
- ✅ Parameterized SQL queries (100% of database operations)
- ✅ express-validator on all API inputs
- ✅ React automatic XSS escaping
- ✅ Content Security Policy headers
- ✅ SQL injection prevention
- ✅ Command injection prevention

**Protected Endpoints**:
- All authentication endpoints
- All data modification endpoints
- All search/filter endpoints

### 4. Rate Limiting & DDoS Protection

**Implemented**:
- ✅ Redis-based rate limiting
- ✅ 4-tier protection:
  - Authentication endpoints: 5 requests/15min per IP
  - Vote endpoints: 10 requests/15min per user
  - Comment endpoints: 20 requests/15min per user
  - General API: 100 requests/15min per IP

**Recommendations**:
- Deploy behind CDN (Cloudflare, CloudFront)
- Implement CAPTCHA for sensitive operations
- Monitor for abnormal traffic patterns

### 5. Data Protection

**At Rest**:
- ✅ Password hashing (Bcrypt, 12 rounds)
- ✅ Secret salts encrypted (AES-256)
- ⚠️  Database encryption (enable via PostgreSQL configuration)

**In Transit**:
- ✅ HTTPS enforced in production
- ✅ TLS 1.2+ required
- ✅ Strong cipher suites
- ✅ HSTS headers

**Recommendations**:
- Enable PostgreSQL encryption at rest
- Use AWS RDS encryption or equivalent
- Implement database column-level encryption for sensitive data

### 6. Security Headers

**Implemented** (via Helmet.js):
- ✅ Content-Security-Policy
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Strict-Transport-Security (HSTS)
- ✅ Referrer-Policy: no-referrer

### 7. Session Security

**Implemented**:
- ✅ HTTP-only cookies (JavaScript cannot access tokens)
- ✅ Secure flag in production
- ✅ SameSite=Strict for CSRF protection
- ✅ Short access token lifetime (15 minutes)
- ✅ Refresh token rotation

**Recommendations**:
- Implement session revocation
- Log all authentication events
- Add IP address binding (optional)

### 8. Audit Trail & Integrity

**Implemented**:
- ✅ Hash chain for event log (SHA-256)
- ✅ Append-only audit events
- ✅ Tamper detection via hash verification
- ✅ Public verification API
- ✅ Independent CLI verifier tool

**Verifiable Events**:
- All vote events (with nullifiers only)
- Poll creation/updates
- Commitment creation/updates
- Admin actions

---

## Known Security Limitations

### 1. Identity Verification (MVP)

**Current Implementation**:
- Email + password authentication
- Manual admin approval per tenant

**Limitations**:
- Susceptible to fake email accounts
- No government ID verification
- Relies on admin vigilance

**V2 Improvements** (Planned):
- eID/itsme integration
- Government identity providers
- Advanced anonymous credentials (BBS+, ZK proofs)

### 2. Single Encryption Key

**Current Implementation**:
- Single `ENCRYPTION_KEY` for all tenants

**Limitation**:
- Key compromise affects all tenants

**Recommendation**:
- Implement per-tenant key derivation
- Use AWS KMS or similar key management service

### 3. Vote Coercion

**Not Protected Against**:
- Someone watching voter's screen
- Voter being forced to vote certain way
- Vote buying schemes

**Mitigation** (User Education):
- Vote in private
- Don't share device during voting
- Report coercion attempts

### 4. Sybil Attacks (MVP)

**Current Protection**:
- Email verification
- Admin approval
- Rate limiting

**Limitation**:
- Determined attacker could create multiple accounts

**V2 Improvements** (Planned):
- Official identity verification
- Phone number verification
- IP address monitoring

---

## Security Best Practices for Deployment

### 1. Environment Variables

**Never commit**:
- JWT_SECRET
- ENCRYPTION_KEY
- DATABASE_PASSWORD
- REDIS_PASSWORD
- API keys

**Generate securely**:
```bash
# Generate JWT secret
openssl rand -base64 64

# Generate encryption key
openssl rand -base64 32
```

### 2. Database Security

**PostgreSQL Configuration**:
```sql
-- Revoke public access
REVOKE ALL ON DATABASE democracy_os FROM PUBLIC;

-- Create read-only user
CREATE USER analytics_ro WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE democracy_os TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_ro;

-- Enable SSL
ALTER SYSTEM SET ssl = on;
```

**Recommendations**:
- Use managed database service (AWS RDS, etc.)
- Enable encryption at rest
- Enable SSL/TLS connections
- Regular backups with encryption
- Restrict network access (VPC/Security Groups)

### 3. Redis Security

**Configuration**:
```conf
# Require password
requirepass <strong_password>

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""

# Bind to localhost or private network
bind 127.0.0.1
```

### 4. Firewall Rules

**Recommended**:
```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH (restrict to admin IPs)
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw deny 5432/tcp   # PostgreSQL (no public access)
ufw deny 6379/tcp   # Redis (no public access)
ufw enable
```

### 5. Monitoring & Alerts

**What to Monitor**:
- Failed authentication attempts (> 5/min)
- Unusual voting patterns
- High error rates
- Database query performance
- Audit log integrity violations
- Resource usage spikes

**Tools**:
- Sentry (error tracking)
- Datadog/New Relic (APM)
- AWS CloudWatch (infrastructure)
- ELK Stack (log aggregation)

### 6. Regular Updates

**Update Schedule**:
- Security patches: Immediately
- Dependencies: Weekly
- Framework versions: Monthly
- Major upgrades: Quarterly

**Commands**:
```bash
# Check for vulnerabilities
pnpm audit

# Update dependencies
pnpm update

# Fix vulnerabilities
pnpm audit fix
```

---

## Incident Response Plan

### 1. Detection

**Sources**:
- Automated monitoring alerts
- User reports
- Security scan results
- Log analysis

### 2. Assessment

**Severity Levels**:
- **Critical**: Active exploit, data breach, auth bypass
- **High**: Potential data exposure, privilege escalation
- **Medium**: Denial of service, information disclosure
- **Low**: Minor security weakness

### 3. Response Actions

**Critical Incident**:
1. Immediately notify security team
2. Assess scope and impact
3. Contain the threat (block IPs, disable features)
4. Preserve evidence (logs, databases)
5. Notify affected users
6. Patch vulnerability
7. Conduct post-mortem

### 4. Communication

**Internal**:
- Security team (immediate)
- Engineering team (within 1 hour)
- Management (within 2 hours)

**External**:
- Affected users (within 24 hours)
- Public disclosure (after patch, if appropriate)

---

## Security Checklist for Production

### Pre-Deployment

- [ ] All secrets generated securely and stored safely
- [ ] HTTPS enabled with valid certificate
- [ ] Database encryption at rest enabled
- [ ] Redis password set and dangerous commands disabled
- [ ] Firewall rules configured
- [ ] Security headers configured (Helmet.js)
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] CORS properly configured
- [ ] Error messages don't leak sensitive info

### Post-Deployment

- [ ] Monitoring and alerting configured
- [ ] Log aggregation set up
- [ ] Backup strategy implemented
- [ ] Incident response plan documented
- [ ] Security contact published
- [ ] Vulnerability disclosure policy published
- [ ] Regular security audits scheduled
- [ ] Penetration testing conducted

### Ongoing

- [ ] Weekly dependency updates
- [ ] Monthly security patches
- [ ] Quarterly penetration testing
- [ ] Annual third-party security audit
- [ ] Regular backup restoration tests
- [ ] Incident response drills

---

## Compliance & Standards

### GDPR Compliance

**Implemented**:
- ✅ Data minimization (only essential data collected)
- ✅ Right to erasure (account deletion)
- ✅ Data portability (export features)
- ✅ Privacy by design (anonymous voting)
- ✅ Transparent data handling

**Requirements**:
- Obtain user consent for data processing
- Provide privacy policy
- Implement data retention policies
- Designate data protection officer (if applicable)

### OWASP Top 10 (2021)

**Protection Status**:
- ✅ A01: Broken Access Control - Protected via RBAC + tenant isolation
- ✅ A02: Cryptographic Failures - Bcrypt, TLS, encrypted storage
- ✅ A03: Injection - Parameterized queries, input validation
- ✅ A04: Insecure Design - Security requirements in design phase
- ✅ A05: Security Misconfiguration - Helmet.js, secure defaults
- ✅ A06: Vulnerable Components - Regular updates, audit checks
- ✅ A07: Authentication Failures - JWT, bcrypt, rate limiting
- ✅ A08: Software Integrity Failures - Hash chain, audit trail
- ✅ A09: Logging Failures - Comprehensive audit logging
- ✅ A10: SSRF - Input validation, no user-controlled URLs

---

## Additional Resources

### Documentation
- [Architecture Documentation](docs/architecture.md) - System design
- [Security Deep Dive](docs/security.md) - Detailed threat analysis
- [Deployment Guide](DEPLOYMENT.md) - Production setup

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

## Security Contact

**For security issues only**: [security@democracy-os.org]
**For general support**: [support@democracy-os.org]
**GitHub**: [Open a security advisory](https://github.com/your-org/democracy-os/security/advisories/new)

---

**Last Updated**: 2026-01-16
**Version**: 1.0.0
