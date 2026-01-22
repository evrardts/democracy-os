-- Democracy OS Initial Schema Migration
-- Creates all core tables for the MVP

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('citizen', 'elected_official', 'administration');
CREATE TYPE poll_type AS ENUM ('quick_poll', 'multi_stage');
CREATE TYPE poll_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE vote_type AS ENUM ('upvote', 'downvote');
CREATE TYPE report_reason AS ENUM ('spam', 'hate', 'off_topic', 'harassment');
CREATE TYPE commitment_status AS ENUM ('planned', 'in_progress', 'delivered', 'cancelled');

-- Tenants table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'citizen',
    display_name VARCHAR(100) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    secret_salt VARCHAR(255) NOT NULL, -- For nullifier generation, should be encrypted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- Polls table
CREATE TABLE polls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    poll_type poll_type NOT NULL DEFAULT 'quick_poll',
    status poll_status NOT NULL DEFAULT 'draft',
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    options JSONB NOT NULL, -- Array of {id: string, text: string}
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_polls_tenant_id ON polls(tenant_id);
CREATE INDEX idx_polls_creator_id ON polls(creator_id);
CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_polls_start_time ON polls(start_time);
CREATE INDEX idx_polls_end_time ON polls(end_time);
CREATE INDEX idx_polls_tags ON polls USING GIN(tags);

-- Votes table (anonymous voting)
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier VARCHAR(64) NOT NULL, -- Hash of (pollId + userSecretSalt)
    option_id VARCHAR(255) NOT NULL,
    vote_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_vote_id UUID REFERENCES votes(id) ON DELETE SET NULL,
    UNIQUE(poll_id, nullifier)
);

CREATE INDEX idx_votes_poll_id ON votes(poll_id);
CREATE INDEX idx_votes_nullifier ON votes(nullifier);
CREATE INDEX idx_votes_option_id ON votes(option_id);

-- Comments table
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    edit_history JSONB DEFAULT '[]', -- Array of {content: string, edited_at: timestamp}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_poll_id ON comments(poll_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id) WHERE parent_id IS NOT NULL;

-- Comment votes table
CREATE TABLE comment_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type vote_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_votes_comment_id ON comment_votes(comment_id);
CREATE INDEX idx_comment_votes_user_id ON comment_votes(user_id);

-- Comment reports table
CREATE TABLE comment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason report_reason NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, reporter_id)
);

CREATE INDEX idx_comment_reports_comment_id ON comment_reports(comment_id);
CREATE INDEX idx_comment_reports_reporter_id ON comment_reports(reporter_id);

-- Commitments table (transparency module)
CREATE TABLE commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    responsible_party VARCHAR(255),
    planned_budget DECIMAL(15, 2),
    actual_budget DECIMAL(15, 2),
    target_date DATE,
    status commitment_status NOT NULL DEFAULT 'planned',
    version INTEGER NOT NULL DEFAULT 1,
    previous_version_id UUID REFERENCES commitments(id) ON DELETE SET NULL,
    attachments JSONB DEFAULT '[]', -- Array of {filename: string, url: string, uploaded_at: timestamp}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commitments_tenant_id ON commitments(tenant_id);
CREATE INDEX idx_commitments_creator_id ON commitments(creator_id);
CREATE INDEX idx_commitments_status ON commitments(status);
CREATE INDEX idx_commitments_previous_version_id ON commitments(previous_version_id) WHERE previous_version_id IS NOT NULL;

-- Audit events table (tamper-resistant audit trail)
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of payload
    previous_event_hash VARCHAR(64), -- Hash chain for integrity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_events_tenant_id ON audit_events(tenant_id);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_entity_type ON audit_events(entity_type);
CREATE INDEX idx_audit_events_entity_id ON audit_events(entity_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_polls_updated_at BEFORE UPDATE ON polls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commitments_updated_at BEFORE UPDATE ON commitments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a default tenant for development
INSERT INTO tenants (name, slug, domain, settings) VALUES
('Default Municipality', 'default', 'localhost', '{"features": {"comments": true, "commitments": true}}');

COMMENT ON TABLE tenants IS 'Multi-tenant isolation - each municipality/organization';
COMMENT ON TABLE users IS 'User accounts with encrypted sensitive fields';
COMMENT ON TABLE polls IS 'Polls/consultations with flexible options';
COMMENT ON TABLE votes IS 'Anonymous votes using nullifier system';
COMMENT ON TABLE comments IS 'User comments on polls with edit history';
COMMENT ON TABLE comment_votes IS 'Upvotes/downvotes on comments';
COMMENT ON TABLE comment_reports IS 'User reports for comment moderation';
COMMENT ON TABLE commitments IS 'Government commitments with version history';
COMMENT ON TABLE audit_events IS 'Tamper-resistant audit trail with hash chain';
