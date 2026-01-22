-- Migration 003: Documents storage
-- Date: 2026-01-16
-- Description: Add documents table for S3/MinIO file storage

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(500) NOT NULL, -- S3 key (path)
  url TEXT NOT NULL, -- Public or presigned URL
  filename VARCHAR(255) NOT NULL, -- Original filename
  size BIGINT NOT NULL, -- File size in bytes
  mime_type VARCHAR(100) NOT NULL, -- MIME type (e.g., application/pdf)
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for documents
CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Update trigger for documents
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add document_ids array to commitments (many-to-many via JSONB)
-- This allows commitments to reference multiple documents
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS document_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Create index on document_ids for faster lookups
CREATE INDEX IF NOT EXISTS idx_commitments_document_ids ON commitments USING GIN(document_ids);

-- Comments
COMMENT ON TABLE documents IS 'Stores metadata for uploaded documents (actual files in S3/MinIO)';
COMMENT ON COLUMN documents.key IS 'S3 object key (path in bucket)';
COMMENT ON COLUMN documents.url IS 'Public URL or base URL for presigned generation';
COMMENT ON COLUMN documents.size IS 'File size in bytes';
COMMENT ON COLUMN documents.mime_type IS 'MIME type for content-type header';
COMMENT ON COLUMN commitments.document_ids IS 'Array of document UUIDs attached to this commitment';
