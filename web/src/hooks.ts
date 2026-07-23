import { useEffect, useState } from "react";

/** Poll an async loader immediately and every `ms`; keeps last good data on error. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		const load = () => {
			fn()
				.then((d) => {
					if (!alive) return;
					setData(d);
					setError(null);
				})
				.catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
		};
		load();
		const id = setInterval(load, ms);
		return () => {
			alive = false;
			clearInterval(id);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return { data, error };
}
