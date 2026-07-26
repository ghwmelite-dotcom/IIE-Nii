// Screenshot helper: drives headless Edge over CDP (no npm deps; Node 22+).
// Usage: node scripts/screenshot.mjs <url> <out.png> [delayMs=6000] [width] [height]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const [url, out, delayMs = "6000", width = "1440", height = "900"] = process.argv.slice(2);
if (!url || !out) {
	console.error("usage: node scripts/screenshot.mjs <url> <out.png> [delayMs] [width] [height]");
	process.exit(1);
}

const EDGE_CANDIDATES = [
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const EDGE = EDGE_CANDIDATES.find(existsSync);
if (!EDGE) throw new Error("msedge.exe not found");

const port = 9222 + Math.floor(Math.random() * 500);
const edge = spawn(
	EDGE,
	["--headless", "--disable-gpu", `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, "about:blank"],
	{ stdio: "ignore" },
);
process.on("exit", () => edge.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json`);
			const page = (await res.json()).find((t) => t.type === "page");
			if (page) return page.webSocketDebuggerUrl;
		} catch {
			// not up yet
		}
		await sleep(500);
	}
	throw new Error("no CDP page target");
}

const ws = new WebSocket(await getWsUrl());
let nextId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
};
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++nextId;
		pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg)));
		ws.send(JSON.stringify({ id, method, params }));
	});

await new Promise((r) => (ws.onopen = r));
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: Number(width),
	height: Number(height),
	deviceScaleFactor: 1,
	mobile: false,
});
await send("Page.navigate", { url });
await sleep(Number(delayMs));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("wrote", out);
ws.close();
edge.kill();
process.exit(0);
