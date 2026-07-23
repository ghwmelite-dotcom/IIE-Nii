import { useEffect, useState } from "react";
import { api } from "../api";
import type { Employee } from "../api";

interface Props {
	value: string;
	onChange: (employeeId: string) => void;
	className?: string;
	/** Only offer these roles (e.g. ["director"] in an approver picker). */
	roles?: string[];
}

/**
 * Staff dropdown fed by the org directory. Falls back to a free-text input
 * when the directory can't be loaded (offline API, pre-seed database).
 */
export default function EmployeePicker({ value, onChange, className, roles }: Props) {
	const [employees, setEmployees] = useState<Employee[] | null>(null);

	useEffect(() => {
		api
			.employees()
			.then((r) => setEmployees(r.employees))
			.catch(() => setEmployees(null));
	}, []);

	if (!employees) {
		return (
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={className}
				title="Employee ID (directory unavailable — type it manually)"
			/>
		);
	}

	const options = roles ? employees.filter((e) => roles.includes(e.role)) : employees;
	return (
		<select value={value} onChange={(e) => onChange(e.target.value)} className={className} title="Employee">
			{!options.some((e) => e.employee_id === value) && <option value={value}>{value}</option>}
			{options.map((e) => (
				<option key={e.employee_id} value={e.employee_id}>
					{e.name} — {e.employee_id} · {e.department_id}
				</option>
			))}
		</select>
	);
}
