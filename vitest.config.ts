import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => ({
	plugins: [
		cloudflareTest({
			main: "./src/index.ts",
			wrangler: { configPath: "./wrangler.jsonc" },
			// Tests never touch the real AI / Vectorize services.
			remoteBindings: false,
			miniflare: {
				bindings: {
					ENVIRONMENT: "test",
					MIGRATIONS: await readD1Migrations("./migrations"),
				},
			},
		}),
	],
}));
