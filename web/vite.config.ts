import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		// Frontend iteration against the Worker dev server: `npm run dev` (root)
		// plus `npm --prefix web run dev`.
		proxy: { "/api": "http://localhost:8787" },
	},
});
