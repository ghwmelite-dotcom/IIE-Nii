interface Props {
	label: string;
	error: string | null;
}

/** Inline banner for a failed poller — shown until the next successful fetch. */
export default function LoadError({ label, error }: Props) {
	if (!error) return null;
	return (
		<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
			Couldn't load {label} — {error}. Retrying automatically.
		</p>
	);
}
