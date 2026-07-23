import { Hono } from "hono";
import { canonicalEventSchema, eventBatchSchema, insertEvents, toStoredEvent } from "./lib/events";
import type { EventRow } from "./lib/events";
import { apiKeyAuth } from "./lib/auth";
import intelligence from "./routes/intelligence";
import attendance from "./routes/attendance";
import leave from "./routes/leave";
import org from "./routes/org";
import chatbot from "./routes/chatbot";
import stats from "./routes/stats";
import { runMiningJob } from "./mining/job";
import { runDailyChecks } from "./jobs/daily";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", environment: c.env.ENVIRONMENT }));

app.route("/api/intelligence", intelligence);
app.route("/api/attendance", attendance);
app.route("/api/leave", leave);
app.route("/api/org", org);
app.route("/api/chatbot", chatbot);
app.route("/api/stats", stats);

// Ingest a single event into the Unified Event Log.
app.post("/api/events", apiKeyAuth, async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = canonicalEventSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid event", issues: parsed.error.issues }, 400);
	}

	const event = toStoredEvent(parsed.data);
	await insertEvents(c.env.DB, [event]);
	// Queue fanout (PRD §4.2) plugs in here once the Queues binding is added.

	console.log(JSON.stringify({ message: "event ingested", event_id: event.event_id, activity: event.activity }));
	return c.json({ event_id: event.event_id }, 201);
});

// Batch ingestion — used by the seed script and bursty subsystem producers.
app.post("/api/events/batch", apiKeyAuth, async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = eventBatchSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid event batch", issues: parsed.error.issues }, 400);
	}

	const events = parsed.data.map(toStoredEvent);
	await insertEvents(c.env.DB, events);

	console.log(JSON.stringify({ message: "event batch ingested", count: events.length }));
	return c.json({ ingested: events.length, event_ids: events.map((e) => e.event_id) }, 201);
});

// Retrieve the event trace for a single case, ordered by occurrence.
app.get("/api/events", async (c) => {
	const caseId = c.req.query("case_id");
	if (!caseId) {
		return c.json({ error: "case_id query parameter is required" }, 400);
	}

	const { results } = await c.env.DB.prepare(
		`SELECT event_id, case_id, activity, resource, "timestamp", source_system, metadata, ingested_at
		 FROM events WHERE case_id = ? ORDER BY "timestamp" ASC LIMIT 500`,
	)
		.bind(caseId)
		.all<EventRow>();

	const events = results.map((row) => ({ ...row, metadata: JSON.parse(row.metadata) as unknown }));
	return c.json({ case_id: caseId, count: events.length, events });
});

// Latest events across all systems — the dashboard feed's initial load and the
// polling fallback for when the SSE stream (/api/events/stream) is unavailable.
app.get("/api/events/recent", async (c) => {
	const limit = Math.min(Number(c.req.query("limit") ?? 25) || 25, 200);
	const { results } = await c.env.DB.prepare(
		`SELECT event_id, case_id, activity, resource, "timestamp", source_system, metadata
		 FROM events ORDER BY "timestamp" DESC, rowid DESC LIMIT ?`,
	)
		.bind(limit)
		.all<EventRow>();

	const events = results.map((row) => ({ ...row, metadata: JSON.parse(row.metadata) as unknown }));
	return c.json({ events });
});

// Server-sent events live feed (PRD §4.2). Streams events inserted after the
// client connects; the dashboard falls back to polling /recent if this errors.
app.get("/api/events/stream", (c) => {
	const db = c.env.DB;
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let timer: ReturnType<typeof setInterval> | undefined;
			const stop = () => {
				if (timer !== undefined) clearInterval(timer);
				timer = undefined;
			};
			try {
				// Only events inserted from now on — initial state comes from /recent.
				let lastRowid = (await db.prepare("SELECT MAX(rowid) AS m FROM events").first<{ m: number | null }>())?.m ?? 0;
				const flush = async () => {
					const { results } = await db
						.prepare(
							`SELECT rowid, event_id, case_id, activity, resource, "timestamp", source_system, metadata
							 FROM events WHERE rowid > ? ORDER BY rowid LIMIT 100`,
						)
						.bind(lastRowid)
						.all<EventRow & { rowid: number }>();
					for (const { rowid, metadata, ...row } of results) {
						lastRowid = Math.max(lastRowid, rowid);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...row, metadata: JSON.parse(metadata) })}\n\n`));
					}
					controller.enqueue(encoder.encode(`: heartbeat\n\n`));
				};
				await flush();
				timer = setInterval(() => {
					flush().catch(() => stop());
				}, 2000);
				c.req.raw.signal.addEventListener("abort", stop);
			} catch {
				stop();
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

app.notFound((c) => {
	// Unknown API paths get a JSON 404; everything else is the SPA's job —
	// delegate to static assets, which serves index.html under the SPA fallback.
	if (c.req.path.startsWith("/api/") || c.req.path === "/health") {
		return c.json({ error: "Not found" }, 404);
	}
	return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
	console.error(JSON.stringify({ message: "unhandled error", error: err.message, path: c.req.path }));
	return c.json({ error: "Internal server error" }, 500);
});

export default {
	fetch: app.fetch,
	// Two schedules (PRD §4.2, §5.2): process mining every 6h; attendance/leave
	// housekeeping daily after work hours (Accra = UTC).
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		if (controller.cron === "43 18 * * *") {
			ctx.waitUntil(runDailyChecks(env));
		} else {
			ctx.waitUntil(runMiningJob(env));
		}
	},
} satisfies ExportedHandler<Env>;
