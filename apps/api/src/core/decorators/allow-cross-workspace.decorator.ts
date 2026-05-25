import { SetMetadata } from '@nestjs/common';

export const ALLOW_CROSS_WORKSPACE_KEY = 'allowCrossWorkspace';

/** Permits body/param workspaceId to differ from JWT (e.g. switch-workspace). */
export const AllowCrossWorkspace = () => SetMetadata(ALLOW_CROSS_WORKSPACE_KEY, true);
