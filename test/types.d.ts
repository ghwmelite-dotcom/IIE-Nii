// Test-only Env extension: the MIGRATIONS binding injected by vitest.config.ts.
// Written without top-level imports so this file stays a global script and the
// namespace merges with the one in worker-configuration.d.ts.
declare namespace Cloudflare {
	interface Env {
		MIGRATIONS: Parameters<typeof import("cloudflare:test").applyD1Migrations>[1];
	}
}
