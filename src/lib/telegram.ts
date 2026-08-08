export async function sendTelegram(env: Env, text: string): Promise<boolean> {
	const token = env.TELEGRAM_BOT_TOKEN;
	const chatId = env.TELEGRAM_CHAT_ID;
	if (!token || !chatId) {
		console.log(JSON.stringify({ message: "telegram not configured; skipping push" }));
		return false;
	}
	const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
	});
	if (!res.ok) {
		console.error(JSON.stringify({ message: "telegram push failed", status: res.status }));
		return false;
	}
	return true;
}
