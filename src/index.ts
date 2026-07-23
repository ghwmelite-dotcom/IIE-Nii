import { Hono } from "hono";
import { canonicalEventSchema, eventBatchSchema, insertEvents, toStoredEvent } from "./lib/events";
import type { EventRow } from "./lib/events";
import intelligence from "./routes/intelligence";
import attendance from "./routes/attendance";
import leave from "./routes/leave";
import org from "./routes/org";
import { runMiningJob } from "./mining/job";
import { runDailyChecks } from "./jobs/daily";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", environment: c.env.ENVIRONMENT }));

app.route("/api/intelligence", intelligence);
app.route("/api/attendance", attendance);
app.route("/api/leave", leave);
app.route("/api/org", org);

// Ingest a single event into the Unified Event Log.
app.post("/api/events", async (c) => {
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
app.post("/api/events/batch", async (c) => {
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
