import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, seedOrg } from "./helpers";
import { buildReport } from "../src/lib/reports";

const REF = "2026-03-10T00:00:00Z"; // window end; weekly window = [2026-03-03, 2026-03-10)

describe("report aggregation", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		// attendance within window: 4 clock-ins, 2 late
		await env.DB.batch([
			env.DB.prepare("INSERT INTO attendance_records (record_id, employee_id, date, clock_in, status) VALUES ('a1','EMP-1','2026-03-06','2026-03-06T08:00:00Z','present')"),
			env.DB.prepare("INSERT INTO attendance_records (record_id, employee_id, date, clock_in, status) VALUES ('a2','EMP-2','2026-03-06','2026-03-06T09:00:00Z','late')"),
			env.DB.prepare("INSERT INTO attendance_records (record_id, employee_id, date, clock_in, status) VALUES ('a3','MGR-1','2026-03-07','2026-03-07T09:10:00Z','late')"),
			env.DB.prepare("INSERT INTO attendance_records (record_id, employee_id, date, clock_in, status) VALUES ('a4','MGR-2','2026-03-07','2026-03-07T08:00:00Z','present')"),
		]);
		// leave within window: 2 submitted, 1 completed (cycle 2 days)
		await env.DB.batch([
			env.DB.prepare("INSERT INTO leave_requests (request_id, employee_id, type, start_date, end_date, status, current_step, created_at) VALUES ('L1','EMP-1','annual','2026-03-20','2026-03-22','completed','completed','2026-03-06T00:00:00Z')"),
			env.DB.prepare("INSERT INTO leave_requests (request_id, employee_id, type, start_date, end_date, status, current_step, created_at) VALUES ('L2','EMP-2','sick','2026-03-21','2026-03-22','pending','supervisor_review','2026-03-06T00:00:00Z')"),
			env.DB.prepare("INSERT INTO workflow_transitions (transition_id, request_id, from_step, to_step, actor_id, timestamp) VALUES ('t1','L1','director_fa_approval','completed','DIR-F&A','2026-03-08T00:00:00Z')"),
		]);
		// a couple events within window
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (event_id, case_id, activity, resource, timestamp, source_system, metadata) VALUES ('e1','L1','leave_submitted','EMP-1','2026-03-06T00:00:00Z','LEAVE_WORKFLOW','{}')"),
			env.DB.prepare("INSERT INTO events (event_id, case_id, activity, resource, timestamp, source_system, metadata) VALUES ('e2','att-EMP-1','clock_in','EMP-1','2026-03-06T08:00:00Z','ATTENDANCE','{}')"),
		]);
	});

	it("aggregates the weekly window deterministically", async () => {
		const r = await buildReport(env, "weekly", REF);
		expect(r.meta.period).toBe("weekly");
		expect(r.meta.start.slice(0, 10)).toBe("2026-03-03");
		expect(r.meta.end.slice(0, 10)).toBe("2026-03-10");
		expect(r.attendance.clock_ins).toBe(4);
		expect(r.attendance.late).toBe(2);
		expect(r.attendance.late_rate).toBeCloseTo(0.5);
		expect(r.leave.submitted).toBe(2);
		expect(r.leave.completed).toBe(1);
		expect(r.leave.avg_cycle_days).toBeCloseTo(2);
		expect(r.leave.by_type.find((t) => t.type === "annual")?.count).toBe(1);
		expect(r.summary.employees).toBeGreaterThan(0);
		expect(r.summary.events).toBe(2);
		expect(Array.isArray(r.recommendations)).toBe(true);
		expect(typeof r.process.flagged_bottlenecks).toBe("number");
	});

	it("supports monthly and yearly windows", async () => {
		expect((await buildReport(env, "monthly", REF)).meta.period).toBe("monthly");
		expect((await buildReport(env, "yearly", REF)).meta.period).toBe("yearly");
	});
});
