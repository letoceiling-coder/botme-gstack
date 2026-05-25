-- M10.5 Realtime foundation: visitor sessions, call sessions, operator locks
CREATE TYPE "VisitorSessionStatus" AS ENUM ('ONLINE', 'IDLE', 'OFFLINE');
CREATE TYPE "VisitorControlMode" AS ENUM ('AI', 'OPERATOR', 'HYBRID');
CREATE TYPE "CallSessionStatus" AS ENUM ('IDLE', 'INVITED', 'ACTIVE', 'ENDED');
CREATE TYPE "CallSessionType" AS ENUM ('VOICE', 'VIDEO');

CREATE TABLE "visitor_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "socketId" TEXT,
    "currentPage" TEXT,
    "country" TEXT,
    "device" JSONB,
    "controlMode" "VisitorControlMode" NOT NULL DEFAULT 'AI',
    "status" "VisitorSessionStatus" NOT NULL DEFAULT 'ONLINE',
    "tabVisible" BOOLEAN NOT NULL DEFAULT true,
    "reconnectCount" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "visitorSessionId" TEXT NOT NULL,
    "operatorId" TEXT,
    "type" "CallSessionType" NOT NULL DEFAULT 'VIDEO',
    "status" "CallSessionStatus" NOT NULL DEFAULT 'IDLE',
    "diagnostics" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operator_session_locks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_session_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visitor_sessions_workspaceId_widgetId_visitorId_key" ON "visitor_sessions"("workspaceId", "widgetId", "visitorId");
CREATE INDEX "visitor_sessions_workspaceId_status_lastHeartbeatAt_idx" ON "visitor_sessions"("workspaceId", "status", "lastHeartbeatAt");
CREATE INDEX "visitor_sessions_widgetId_status_idx" ON "visitor_sessions"("widgetId", "status");

CREATE INDEX "call_sessions_workspaceId_status_idx" ON "call_sessions"("workspaceId", "status");
CREATE INDEX "call_sessions_visitorSessionId_idx" ON "call_sessions"("visitorSessionId");

CREATE UNIQUE INDEX "operator_session_locks_workspaceId_conversationId_key" ON "operator_session_locks"("workspaceId", "conversationId");
CREATE INDEX "operator_session_locks_expiresAt_idx" ON "operator_session_locks"("expiresAt");

ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "widget_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_visitorSessionId_fkey" FOREIGN KEY ("visitorSessionId") REFERENCES "visitor_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_session_locks" ADD CONSTRAINT "operator_session_locks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
