/**
 * Retrieval-augmented generation for HR policy Q&A (PRD §5.1).
 * Whole policy documents live in R2; ~800-char chunks are embedded with
 * Workers AI (bge-base-en-v1.5) and indexed in Vectorize, chunk text carried
 * as metadata so retrieval needs no extra storage hop.
 */

export interface PolicyChunk {
	id: string;
	text: string;
	title: string;
	score: number;
}

/** Pack paragraphs into chunks of at most maxChars. */
export function chunkText(text: string, maxChars = 800): string[] {
	const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
	const chunks: string[] = [];
	let current = "";
	for (const paragraph of paragraphs) {
		if (current && current.length + paragraph.length + 2 > maxChars) {
			chunks.push(current);
			current = paragraph;
		} else {
			current = current ? `${current}\n\n${paragraph}` : paragraph;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
	const result = (await env.AI.run(env.AI_EMBED_MODEL, { text: texts })) as { data: number[][] };
	return result.data;
}

/** Store a policy document and index its chunks. Returns the chunk count. */
export async function ingestDocument(env: Env, input: { docId: string; title: string; text: string }): Promise<number> {
	await env.POLICY_DOCS.put(`policies/${input.docId}.txt`, input.text, {
		customMetadata: { title: input.title },
	});

	const chunks = chunkText(input.text);
	if (chunks.length === 0) return 0;

	const vectors = await embed(env, chunks);
	await env.VECTOR_INDEX.upsert(
		chunks.map((chunk, i) => ({
			id: `${input.docId}:${i}`,
			values: vectors[i],
			metadata: { doc_id: input.docId, title: input.title, chunk_index: i, text: chunk },
		})),
	);
	return chunks.length;
}

/** Retrieve the top-K most relevant policy chunks for a question. */
export async function retrievePolicyChunks(env: Env, query: string, topK = 3): Promise<PolicyChunk[]> {
	const [vector] = await embed(env, [query]);
	const matches = await env.VECTOR_INDEX.query(vector, { topK, returnMetadata: "all" });
	return matches.matches.map((m) => ({
		id: m.id,
		score: m.score,
		text: (m.metadata as { text: string }).text,
		title: (m.metadata as { title: string }).title,
	}));
}
