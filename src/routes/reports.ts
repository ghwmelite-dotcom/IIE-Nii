import { Hono } from "hono";
import { requireUser, requirePermission, type AuthEnv } from "../lib/auth";
import { buildReport, type ReportPeriod } from "../lib/reports";
import { reportToCsv } from "../lib/report-csv";
import { reportToHtml } from "../lib/report-html";

const app = new Hono<AuthEnv>();
const PERIODS = ["weekly", "monthly", "yearly"];
const parsePeriod = (p: string): ReportPeriod | null => (PERIODS.includes(p) ? (p as ReportPeriod) : null);

app.use("*", requireUser, requirePermission("reports.read"));

app.get("/:period", async (c) => {
	const period = parsePeriod(c.req.param("period"));
	if (!period) return c.json({ error: "Invalid period" }, 400);
	return c.json(await buildReport(c.env, period));
});

app.get("/:period/csv", async (c) => {
	const period = parsePeriod(c.req.param("period"));
	if (!period) return c.json({ error: "Invalid period" }, 400);
	const csv = reportToCsv(await buildReport(c.env, period));
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
	return c.html(reportToHtml(await buildReport(c.env, period)));
});

export default app;
