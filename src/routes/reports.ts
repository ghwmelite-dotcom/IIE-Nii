import { Hono, type Context } from "hono";
import { currentUser, requireUser, requirePermission, type AuthEnv } from "../lib/auth";
import { buildReport, type ReportPeriod, type ReportUserContext } from "../lib/reports";
import { reportToCsv } from "../lib/report-csv";
import { reportToHtml } from "../lib/report-html";

const app = new Hono<AuthEnv>();
const PERIODS = ["weekly", "monthly", "yearly"];
const parsePeriod = (p: string): ReportPeriod | null => (PERIODS.includes(p) ? (p as ReportPeriod) : null);

app.use("*", requireUser, requirePermission("reports.read"));

function userCtx(c: Context<AuthEnv>): ReportUserContext {
	const u = currentUser(c);
	return { user_id: u.user.user_id, employee_id: u.user.employee_id, roles: u.roles };
}

app.get("/archive", async (c) => {
	const list = await c.env.POLICY_DOCS.list({ prefix: "reports/" });
	return c.json({ objects: list.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })) });
});

app.get("/archive/*", async (c) => {
	const key = c.req.path.replace("/api/reports/archive/", "");
	const obj = await c.env.POLICY_DOCS.get(key);
	if (!obj) return c.json({ error: "Not found" }, 404);
	const ct = key.endsWith(".csv") ? "text/csv" : key.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
	return new Response(obj.body, { headers: { "Content-Type": ct } });
});

app.get("/:period", async (c) => {
	const period = parsePeriod(c.req.param("period"));
	if (!period) return c.json({ error: "Invalid period" }, 400);
	return c.json(await buildReport(c.env, period, userCtx(c)));
});

app.get("/:period/csv", async (c) => {
	const period = parsePeriod(c.req.param("period"));
	if (!period) return c.json({ error: "Invalid period" }, 400);
	const csv = reportToCsv(await buildReport(c.env, period, userCtx(c)));
	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="iie-${period}-${new Date().toISOString().slice(0, 10)}.csv"`,
		},
	});
});

app.get("/:period/html", async (c) => {
	const period = parsePeriod(c.req.param("period"));
	if (!period) return c.json({ error: "Invalid period" }, 400);
	return c.html(reportToHtml(await buildReport(c.env, period, userCtx(c))));
});

export default app;
