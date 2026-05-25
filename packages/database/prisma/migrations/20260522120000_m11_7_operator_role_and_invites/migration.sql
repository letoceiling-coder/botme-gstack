-- M11.7: OPERATOR role + workspace invites
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'OPERATOR';

CREATE TABLE "workspace_invites" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OPERATOR',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invites_tokenHash_key" ON "workspace_invites"("tokenHash");
CREATE UNIQUE INDEX "workspace_invites_workspaceId_email_key" ON "workspace_invites"("workspaceId", "email");
CREATE INDEX "workspace_invites_expiresAt_idx" ON "workspace_invites"("expiresAt");

ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
