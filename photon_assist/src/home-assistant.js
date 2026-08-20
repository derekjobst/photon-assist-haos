const CONVERSATION_URL = "http://supervisor/core/api/conversation/process";

export class HomeAssistantError extends Error {
  constructor({ kind, status, body }) {
    super(kind);
    this.name = "HomeAssistantError";
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

function errorMessage(body) {
  if (!body || typeof body !== "object") return "";
  return [body.message, body.error, body.detail].filter((value) => typeof value === "string").join(" ");
}

export function isInvalidConversationError(error) {
  return (
    error instanceof HomeAssistantError &&
    error.kind === "http" &&
    error.status === 400 &&
    /conversation(?:[_ ]?id)?/i.test(errorMessage(error.body))
  );
}

export function extractReply(response) {
  const speech = response?.response?.speech?.plain?.speech;
  return typeof speech === "string" && speech.trim() !== "" ? speech.trim() : undefined;
}

export function createHomeAssistantClient({ supervisorToken, fetchImpl = fetch, timeoutMs = 30_000 }) {
  if (typeof supervisorToken !== "string" || supervisorToken === "") {
    throw new HomeAssistantError({ kind: "configuration" });
  }

  async function process({ text, language, agentId, conversationId }) {
    const payload = { text, language, agent_id: agentId };
    if (conversationId) payload.conversation_id = conversationId;

    let response;
    try {
      response = await fetchImpl(CONVERSATION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new HomeAssistantError({ kind: error?.name === "TimeoutError" ? "timeout" : "network" });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      throw new HomeAssistantError({ kind: "http", status: response.status, body });
    }

    const replyText = extractReply(body);
    if (!replyText) throw new HomeAssistantError({ kind: "response" });

    return { conversationId: body.conversation_id, replyText };
  }

  return { process };
}

