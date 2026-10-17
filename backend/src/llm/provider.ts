type ChatMessage = { role: "system" | "user"; content: string };

export function llmConfigured(): boolean {
  return Boolean(
    process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
  );
}

export async function completeJson<T>(
  messages: ChatMessage[],
  parse: (value: unknown) => T,
): Promise<T> {
  if (!llmConfigured()) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL must be configured.");
  }
  const baseUrl = process.env.LLM_BASE_URL!.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`LLM provider returned HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("choices" in payload) ||
    !Array.isArray(payload.choices)
  ) {
    throw new Error("LLM provider returned an unexpected response.");
  }
  const choice = payload.choices[0];
  if (
    typeof choice !== "object" ||
    choice === null ||
    !("message" in choice) ||
    typeof choice.message !== "object" ||
    choice.message === null ||
    !("content" in choice.message) ||
    typeof choice.message.content !== "string"
  ) {
    throw new Error("LLM provider returned no message content.");
  }
  return parse(JSON.parse(choice.message.content) as unknown);
}
