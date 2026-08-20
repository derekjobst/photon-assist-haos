import test from "node:test";
import assert from "node:assert/strict";
import { createHomeAssistantClient, extractReply } from "../src/home-assistant.js";

test("posts a Conversation API request through the Supervisor proxy", async () => {
  let request;
  const client = createHomeAssistantClient({
    supervisorToken: "supervisor-token",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(
        JSON.stringify({
          conversation_id: "next-conversation",
          response: { speech: { plain: { speech: "**Done**" } } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const result = await client.process({
    text: "turn on lights",
    language: "en",
    agentId: "conversation.claude",
    conversationId: "previous-conversation",
  });

  assert.equal(request.url, "http://supervisor/core/api/conversation/process");
  assert.equal(request.init.headers.Authorization, "Bearer supervisor-token");
  assert.deepEqual(JSON.parse(request.init.body), {
    text: "turn on lights",
    language: "en",
    agent_id: "conversation.claude",
    conversation_id: "previous-conversation",
  });
  assert.deepEqual(result, { conversationId: "next-conversation", replyText: "**Done**" });
});

test("extractReply only accepts a plain speech response", () => {
  assert.equal(extractReply({ response: { speech: { plain: { speech: "  hello  " } } } }), "hello");
  assert.equal(extractReply({ response: {} }), undefined);
});

