import { describe, expect, it } from "vitest";
import { capabilitiesFor, hasCapability } from "../src/lib/rbac";

describe("capability map", () => {
	it("gives executives decision + intelligence read", () => {
		const caps = capabilitiesFor(["executive"]);
		expect(caps.has("decision.read")).toBe(true);
		expect(caps.has("intelligence.read")).toBe(true);
		expect(caps.has("admin.users.manage")).toBe(false);
	});

	it("unions capabilities across multiple roles", () => {
		const caps = capabilitiesFor(["hr_admin", "process_analyst"]);
		expect(caps.has("attendance.read.any")).toBe(true);
		expect(caps.has("events.read.any")).toBe(true);
	});

	it("employee role does not grant reports.read capability", () => {
		expect(capabilitiesFor(["employee"]).has("reports.read")).toBe(false);
		expect(capabilitiesFor(["employee"]).has("admin.users.manage")).toBe(false);
	});

	it("hasCapability checks a role list directly", () => {
		expect(hasCapability(["system_admin"], "admin.users.manage")).toBe(true);
		expect(hasCapability(["employee"], "admin.users.manage")).toBe(false);
	});
});
