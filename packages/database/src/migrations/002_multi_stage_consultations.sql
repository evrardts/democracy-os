-- Multi-Stage Consultation Schema
-- Adds support for 3-stage consultation workflow:
-- Stage 1: Idea collection
-- Stage 2: Shortlist selection
-- Stage 3: Final arbitration

-- Stage type enum
CREATE TYPE consultation_stage AS ENUM ('idea_collection', 'shortlist_selection', 'final_arbitration');

-- Ideas table for stage 1 (idea collection)
CREATE TABLE consultation_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    submitter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'submitted', -- submitted, shortlisted, rejected, winner
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consultation_ideas_poll_id ON consultation_ideas(poll_id);
CREATE INDEX idx_consultation_ideas_submitter_id ON consultation_ideas(submitter_id);
CREATE INDEX idx_consultation_ideas_status ON consultation_ideas(status);

-- Idea votes table (for voting on ideas in stage 1 & 2)
CREATE TABLE consultation_idea_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idea_id UUID NOT NULL REFERENCES consultation_ideas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type vote_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(idea_id, user_id)
);

CREATE INDEX idx_consultation_idea_votes_idea_id ON consultation_idea_votes(idea_id);
CREATE INDEX idx_consultation_idea_votes_user_id ON consultation_idea_votes(user_id);

-- Consultation stages table (tracks current stage of multi-stage poll)
CREATE TABLE consultation_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL UNIQUE REFERENCES polls(id) ON DELETE CASCADE,
    current_stage consultation_stage NOT NULL DEFAULT 'idea_collection',
    stage_1_start TIMESTAMP WITH TIME ZONE,
    stage_1_end TIMESTAMP WITH TIME ZONE,
    stage_2_start TIMESTAMP WITH TIME ZONE,
    stage_2_end TIMESTAMP WITH TIME ZONE,
    stage_3_start TIMESTAMP WITH TIME ZONE,
    stage_3_end TIMESTAMP WITH TIME ZONE,
    min_ideas_for_stage_2 INTEGER DEFAULT 10,
    shortlist_size INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consultation_stages_poll_id ON consultation_stages(poll_id);
CREATE INDEX idx_consultation_stages_current_stage ON consultation_stages(current_stage);

-- Trigger for updating updated_at
CREATE TRIGGER update_consultation_ideas_updated_at BEFORE UPDATE ON consultation_ideas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consultation_stages_updated_at BEFORE UPDATE ON consultation_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE consultation_ideas IS 'Stores ideas submitted during stage 1 of multi-stage consultations';
COMMENT ON TABLE consultation_idea_votes IS 'Tracks votes on ideas during stages 1 and 2';
COMMENT ON TABLE consultation_stages IS 'Manages the current stage and timeline of multi-stage consultations';
COMMENT ON COLUMN consultation_stages.min_ideas_for_stage_2 IS 'Minimum number of ideas required to proceed to stage 2';
COMMENT ON COLUMN consultation_stages.shortlist_size IS 'Number of ideas to shortlist for stage 3';
