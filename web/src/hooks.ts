import { useEffect, useState } from "react";
import { api } from "./api";
import type { EventItem } from "./api";

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

/**
 * Live event feed: initial load from /api/events/recent, then pushed updates
 * over SSE (/api/events/stream). Falls back to 5s polling if the stream fails.
 */
export function useEventFeed(limit = 25) {
	const [events, setEvents] = useState<EventItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		let fallback: number | undefined;

		const loadRecent = () =>
			api
				.recentEvents(limit)
				.then((r) => alive && setEvents(r.events.slice(0, limit)))
				.catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));

		const startPolling = () => {
			if (fallback !== undefined) return;
			fallback = window.setInterval(() => {
				api.recentEvents(limit)
					.then((r) => alive && setEvents(r.events.slice(0, limit)))
					.catch(() => {});
			}, 5000);
		};

		loadRecent();

		let es: EventSource | undefined;
		try {
			es = new EventSource("/api/events/stream");
			es.onmessage = (m) => {
				const e = JSON.parse(m.data) as EventItem;
				setEvents((prev) => (prev ? [e, ...prev].slice(0, limit) : prev));
				setError(null);
			};
			es.onerror = () => {
				es?.close();
				setError("live stream unavailable — polling every 5s");
				startPolling();
			};
		} catch {
			setError("live stream unavailable — polling every 5s");
			startPolling();
		}

		return () => {
			alive = false;
			es?.close();
			if (fallback !== undefined) clearInterval(fallback);
		};
	}, [limit]);

	return { events, error };
}
