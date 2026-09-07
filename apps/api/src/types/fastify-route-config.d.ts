import 'fastify';
import type { PermissionKey } from '@bistro/permissions';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Skips the auth/permission guard entirely (e.g. /health, /auth/login). */
    public?: boolean;
    /**
     * Permission keys from @bistro/permissions. An authenticated user needs
     * at least one of these to reach the handler. An empty array still
     * requires authentication, just no specific permission.
     *
     * A route that declares neither `public: true` nor `permissions` is
     * denied outright by the guard (see plugins/guard.ts) -- there is no
     * "forgot to protect this" failure mode.
     */
    permissions?: PermissionKey[];
  }
}
