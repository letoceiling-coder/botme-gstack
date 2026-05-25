-- Add OPERATOR role (must be in separate migration from usage — PostgreSQL enum rule)
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'OPERATOR';
