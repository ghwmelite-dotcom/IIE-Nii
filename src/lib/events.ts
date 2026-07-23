import { z } from "zod";

/**
 * Canonical event schema (PRD §4.3). Every subsystem emits events in this
 * shape; the engine validates, assigns event_id, and appends to the log.
 */
export const SOURCE_SYSTEMS = ["CHATBOT", "ATTENDANCE", "LEAVE_WORKFLOW"] as const;

export const canonicalEventSchema = z.object({
	case_id: z.string().min(1),
	activity: z.string().min(1),
	resource: z.string().min(1),
	timestamp: z.iso.datetime({ offset: true }).optional(),
	source_system: z.enum(SOURCE_SYSTEMS),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const eventBatchSchema = z.array(canonicalEventSchema).min(1).max(1000);

export type CanonicalEventInput = z.input<typeof canonicalEventSchema>;

export interface StoredEvent {
	event_id: string;
	case_id: string;
	activity: string;
	resource: string;
	timestamp: string;
	source_system: (typeof SOURCE_SYSTEMS)[number];
	metadata: Record<string, unknown>;
}

/** Attach server-generated fields to a validated client payload. */
export function toStoredEvent(input: z.infer<typeof canonicalEventSchema>): StoredEvent {
	return {
		...input,
		event_id: crypto.randomUUID(),
		timestamp: input.timestamp ?? new Date().toISOString(),
	};
}

export interface EventRow {
	event_id: string;
	case_id: string;
	activity: string;
	resource: string;
	timestamp: string;
	source_system: string;
	metadata: string;
	ingested_at: string;
}

/** D1 bound-parameter limits stay well clear with 50-statement chunks. */
const INSERT_CHUNK = 50;

export async function insertEvents(db: D1Database, events: StoredEvent[]): Promise<void> {
	const stmt = db.prepare(
		`INSERT INTO events (event_id, case_id, activity, resource, "timestamp", source_system, metadata)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	);
	for (let i = 0; i < events.length; i += INSERT_CHUNK) {
		const chunk = events.slice(i, i + INSERT_CHUNK);
		await db.batch(
			chunk.map((e) =>
				stmt.bind(e.event_id, e.case_id, e.activity, e.resource, e.timestamp, e.source_system, JSON.stringify(e.metadata)),
			),
		);
	}
}
