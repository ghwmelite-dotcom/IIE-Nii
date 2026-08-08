import { buildReport, type ReportPeriod } from "../lib/reports";
import { reportToCsv } from "../lib/report-csv";
import { reportToHtml } from "../lib/report-html";
import { sendTelegram } from "../lib/telegram";

export async function runReportJob(env: Env, period: ReportPeriod): Promise<{ archived: string[] }> {
	const data = await buildReport(env, period);
	const date = data.meta.end.slice(0, 10);
	const csvKey = `reports/${period}/${date}.csv`;
	const htmlKey = `reports/${period}/${date}.html`;
	await env.POLICY_DOCS.put(csvKey, reportToCsv(data), { httpMetadata: { contentType: "text/csv" } });
	await env.POLICY_DOCS.put(htmlKey, reportToHtml(data), { httpMetadata: { contentType: "text/html" } });
	const s = data.summary;
	const text =
		`<b>OHCS IIE — ${period} report</b> (${data.meta.start.slice(0, 10)} → ${date})\n` +
		`Employees: ${s.employees}\nEvents: ${s.events}\nLeave: ${s.leave_submitted} submitted, ${s.leave_completed} completed\n` +
		`Late rate: ${Math.round(s.late_rate * 100)}%\nFlagged bottlenecks: ${data.process.flagged_bottlenecks}`;
	await sendTelegram(env, text);
	console.log(JSON.stringify({ message: "report job done", period, archived: [csvKey, htmlKey] }));
	return { archived: [csvKey, htmlKey] };
}
