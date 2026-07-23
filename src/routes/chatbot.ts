import { Hono } from "hono";
import { z } from "zod";
import { insertEvents, toStoredEvent } from "../lib/events";
import { createLeaveRequest } from "../lib/leave-actions";
import type { EmployeeRecord } from "../lib/leave-actions";
import { ingestDocument, retrievePolicyChunks } from "../lib/rag";

const app = new Hono<{ Bindings: Env }>();

// Simplified entitlement for balance answers (PRD leaves balance rules to HR).
const ANNUAL_LEAVE_ENTITLEMENT_DAYS = 30;
// Below this similarity score the policy corpus is treated as silent.
const MIN_RETRIEVAL_SCORE = 0.45;

const messageSchema = z.object({
	employee_id: z.string().min(1),
	message: z.string().min(1).max(2000),
});

const ingestSchema = z.object({
	doc_id: z.string().min(1).optional(),
	title: z.string().min(1),
	text: z.string().min(1),
});

const INTENTS = ["policy", "attendance", "leave_balance", "leave_request", "other"] as const;
type Intent = (typeof INTENTS)[number];

interface IntentResult {
	intent: Intent;
	leave_type: string | null;
	start_date: string | null;
	end_date: string | null;
}

const FALLBACK_INTENT: IntentResult = { intent: "other", leave_type: null, start_date: null, end_date: null };

/**
 * Normalize a Workers AI text-generation result: `response` is declared as
 * string but some models return a structured object at runtime.
 */
function aiText(result: unknown): string {
	if (typeof result === "string") return result;
	if (result && typeof result === "object" && "response" in result) {
		const response = (result as { response: unknown }).response;
		return typeof response === "string" ? response : JSON.stringify(response);
	}
	return JSON.stringify(result);
}

/** Classify the message with the small model; strict JSON, lenient parsing. */
async function classifyIntent(env: Env, message: string): Promise<IntentResult> {
	const today = new Date().toISOString().slice(0, 10);
	const result = (await env.AI.run(env.AI_INTENT_MODEL, {
		messages: [
			{
				role: "system",
				content: `You classify staff messages for the OHCS (Office of the Head of Civil Service, Ghana) portal. Reply with ONLY a JSON object, no prose:
{"intent":"policy|attendance|leave_balance|leave_request|other","leave_type":string|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null}
- attendance: the user's own attendance, lateness, absences, clock-ins
- leave_balance: how many leave days remain
- leave_request: wants to apply for / book / request leave; fill dates mentioned (resolve relative dates against today, ${today}); leave_type e.g. annual, sick, study, casual
- policy: questions about rules, entitlements, procedures, HR policy
- other: anything else`,
			},
			{ role: "user", content: message },
		],
		max_tokens: 150,
	}));

	const raw = aiText(result);
	const match = raw.match(/\{[\s\S]*\}/);
	if (!match) {
		console.log(JSON.stringify({ message: "intent classification unparsed", raw: raw.slice(0, 300) }));
		return FALLBACK_INTENT;
	}
	try {
		const parsed = JSON.parse(match[0]) as Partial<IntentResult>;
		if (!parsed.intent || !(INTENTS as readonly string[]).includes(parsed.intent)) return FALLBACK_INTENT;
		return {
			intent: parsed.intent,
			leave_type: parsed.leave_type ?? null,
			start_date: parsed.start_date ?? null,
			end_date: parsed.end_date ?? null,
		};
	} catch {
		return FALLBACK_INTENT;
	}
}

// Policy-phrased questions veto keyword routing so "what's the attendance
// policy" still reaches RAG instead of the attendance handler.
const POLICY_PHRASING_RE = /\b(policy|policies|rule|rules|procedure|entitled|how do i|how to)\b/i;
const FIRST_PERSON_RE = /\b(my|me|i)\b/i;
const LEAVE_TYPE_RE = /\b(annual|sick|maternity|paternity|study|casual|compassionate)\b/i;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const DATE_LANGUAGE_RE =
	/\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|tomorrow|next week|next month|monday|tuesday|wednesday|thursday|friday)\b/i;

/**
 * Unambiguous first-person requests are routed by keywords — no LLM call, no
 * hallucination. Policy questions ("what's the grace period", "do I need a
 * certificate") deliberately fall through to the LLM classifier.
 */
function keywordRoute(message: string): Intent | null {
	if (POLICY_PHRASING_RE.test(message)) return null;
	const firstPerson = FIRST_PERSON_RE.test(message);
	if (firstPerson && /\b(attendance|late|lateness|clock(ed)?\s?(in|out)?s?|absent|absence)\b/i.test(message)) {
		return "attendance";
	}
	if (firstPerson && /\b(left|remaining|balance)\b/i.test(message)) return "leave_balance";
	if (/\bleave\b/i.test(message) && datesInMessage(message).length >= 2) return "leave_request";
	return null;
}

function datesInMessage(message: string): string[] {
	return [...message.matchAll(ISO_DATE_RE)].map((m) => m[0]);
}

function leaveTypeIn(message: string): string | null {
	return message.match(LEAVE_TYPE_RE)?.[1] ?? null;
}

function isIsoDate(value: string | null): value is string {
	return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Resolve intent deterministically where possible; fall back to the LLM
 * classifier for everything else. Dates are only ever taken from the user's
 * own words — never trusted to the small model's invention.
 */
async function resolveIntent(env: Env, message: string): Promise<IntentResult> {
	const route = keywordRoute(message);

	if (route === "attendance" || route === "leave_balance") {
		return { ...FALLBACK_INTENT, intent: route };
	}

	if (route === "leave_request") {
		const dates = datesInMessage(message);
		return { intent: "leave_request", leave_type: leaveTypeIn(message), start_date: dates[0], end_date: dates[1] };
	}

	const llm = await classifyIntent(env, message);
	if (llm.intent === "leave_request") {
		const dates = datesInMessage(message);
		if (dates.length >= 2) {
			llm.start_date = dates[0];
			llm.end_date = dates[1];
		} else if (!DATE_LANGUAGE_RE.test(message) || !isIsoDate(llm.start_date) || !isIsoDate(llm.end_date)) {
			// No usable date language in the user's words — the model invented them.
			llm.start_date = null;
			llm.end_date = null;
		}
	}
	return llm;
}

// Conversational front door (PRD §5.1). Stateless: the client resends context.
app.post("/message", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = messageSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid message", issues: parsed.error.issues }, 400);
	}

	const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE employee_id = ?")
		.bind(parsed.data.employee_id)
		.first<EmployeeRecord>();
	if (!employee) {
		return c.json({ error: "Unknown employee" }, 404);
	}

	const message = parsed.data.message;
	const intent = await resolveIntent(c.env, message);
	let reply: string;
	let sources: string[] | undefined;

	switch (intent.intent) {
		case "attendance": {
			const month = new Date().toISOString().slice(0, 7);
			const stats = await c.env.DB.prepare(
				`SELECT COUNT(*) AS days,
				        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
				        SUM(CASE WHEN clock_out IS NULL THEN 1 ELSE 0 END) AS open_days
				 FROM attendance_records WHERE employee_id = ? AND date LIKE ?`,
			)
				.bind(employee.employee_id, `${month}-%`)
				.first<{ days: number; late: number | null; open_days: number | null }>();
			reply = `Your attendance for ${month}: ${stats?.days ?? 0} day(s) recorded, ${stats?.late ?? 0} late arrival(s), ${stats?.open_days ?? 0} missing clock-out(s). Ask me about your leave balance any time.`;
			break;
		}

		case "leave_balance": {
			const year = new Date().getUTCFullYear();
			const { results } = await c.env.DB.prepare(
				`SELECT type, start_date, end_date FROM leave_requests
				 WHERE employee_id = ? AND status = 'completed' AND start_date >= ?`,
			)
				.bind(employee.employee_id, `${year}-01-01`)
				.all<{ type: string; start_date: string; end_date: string }>();
			let used = 0;
			for (const row of results) {
				used += Math.round((Date.parse(row.end_date) - Date.parse(row.start_date)) / 86_400_000) + 1;
			}
			reply = `You have ${Math.max(0, ANNUAL_LEAVE_ENTITLEMENT_DAYS - used)} of ${ANNUAL_LEAVE_ENTITLEMENT_DAYS} annual leave days left in ${year} (${used} used). Want to put in a request?`;
			break;
		}

		case "leave_request": {
			const type = intent.leave_type ?? "annual";
			if (!intent.start_date || !intent.end_date) {
				reply = `Happy to put in ${type === "annual" ? "an" : "a"} ${type} leave request — what are the start and end dates?`;
				break;
			}
			if (intent.end_date < intent.start_date) {
				reply = "Those dates look reversed — the end date is before the start date. Can you give them again?";
				break;
			}
			const { requestId } = await createLeaveRequest(c.env.DB, employee, {
				type,
				start_date: intent.start_date,
				end_date: intent.end_date,
			});
			reply = `Done — your ${type} leave request (${intent.start_date} to ${intent.end_date}) is submitted and now with your line manager for review. Reference: ${requestId}. I'll let you know as it moves.`;
			break;
		}

		case "policy":
		default: {
			// "other" also lands here: for domain-flavored questions the retriever
			// is the arbiter — if nothing matches well, we deflect politely.
			const chunks = await retrievePolicyChunks(c.env, message, 3);
			if (chunks.length === 0 || chunks[0].score < MIN_RETRIEVAL_SCORE) {
				reply =
					intent.intent === "policy"
						? "I couldn't find anything about that in the OHCS policy documents I have. Try rephrasing, or ask HR directly."
						: "I'm the OHCS assistant — I can answer HR policy questions, check your attendance or leave balance, or help you request leave.";
				break;
			}
			const context = chunks.map((chunk, i) => `[${i + 1}] ${chunk.title}:\n${chunk.text}`).join("\n\n");
			const answer = (await c.env.AI.run(c.env.AI_MODEL, {
				messages: [
					{
						role: "system",
						content: `You are the OHCS (Office of the Head of Civil Service, Ghana) HR assistant. Answer ONLY from the policy excerpts below — if they don't cover the question, say so plainly. Cite the document title. Keep it under 120 words.\n\nPolicy excerpts:\n${context}`,
					},
					{ role: "user", content: message },
				],
				max_tokens: 400,
			}));
			const answerText = aiText(answer);
			reply = answerText || "I couldn't compose an answer just now — please try again.";
			sources = [...new Set(chunks.map((chunk) => chunk.title))];
			break;
		}
	}

	await insertEvents(c.env.DB, [
		toStoredEvent({
			case_id: `chat-${employee.employee_id}-${new Date().toISOString().slice(0, 10)}`,
			activity: "chat_query",
			resource: employee.employee_id,
			source_system: "CHATBOT",
			metadata: { intent: intent.intent, department: employee.department_id },
		}),
	]);

	return c.json({ reply, intent: intent.intent, ...(sources ? { sources } : {}) });
});

// Ingest a policy document into the RAG corpus (R2 + Vectorize).
app.post("/ingest", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = ingestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid document", issues: parsed.error.issues }, 400);
	}

	const docId = parsed.data.doc_id ?? parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
	const chunks = await ingestDocument(c.env, { docId, title: parsed.data.title, text: parsed.data.text });

	console.log(JSON.stringify({ message: "policy doc ingested", doc_id: docId, chunks }));
	return c.json({ doc_id: docId, chunks }, 201);
});

export default app;
