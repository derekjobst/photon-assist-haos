import test from "node:test";
import assert from "node:assert/strict";
import { HomeAssistantError } from "../src/home-assistant.js";
import { createRelay } from "../src/relay.js";

function fixture() {
  const calls = [];
  const events = [];
  const reads = [];
  const replies = [];
  const claimed = new Set();
  const conversations = new Map();
  const config = {
    allowedSenders: new Set(["+15551234567"]),
    maxMessageChars: 4000,
    messageRetentionMs: 1000,
    conversationTtlMs: 1000,
    language: "en",
    agentId: "conversation.claude",
  };
  const store = {
    claimMessage: async (id) => !claimed.has(id) && (claimed.add(id), true),
    getConversation: async (id) => conversations.get(id),
    setConversation: async (id, value) => conversations.set(id, value),
    clearConversation: async (id) => conversations.delete(id),
  };
  const assistant = {
    process: async (input) => {
      calls.push(input);
      return { replyText: "**Done**", conversationId: "conversation-2" };
    },
  };
  const logger = {
    debug: (event) => events.push(`debug:${event}`),
    info: (event) => events.push(`info:${event}`),
    warning: (event) => events.push(`warning:${event}`),
    error: (event) => events.push(`error:${event}`),
  };
  const relay = createRelay({
    config,
    store,
    assistant,
    logger,
    reply: async (_message, text) => replies.push(text),
  });
  const space = { id: "dm-1", responding: async (action) => action() };
  const message = {
    id: "message-1",
    platform: "imessage",
    direction: "inbound",
    sender: { id: "+15551234567" },
    content: { type: "text", text: "turn on lights" },
    read: async () => reads.push(message.id),
  };
  return { relay, calls, events, reads, replies, space, message };
}

test("relays an allowed DM and stores the returned conversation", async () => {
  const { relay, calls, reads, replies, space, message } = fixture();
  assert.deepEqual(await relay.handle({ space, message, spaceType: "dm" }), { handled: true });
  assert.deepEqual(reads, ["message-1"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, "conversation.claude");
  assert.deepEqual(replies, ["**Done**"]);
});

test("logs delivery and processing stages for an allowed human-created group message", async () => {
  const group = fixture();
  assert.deepEqual(await group.relay.handle({ space: group.space, message: group.message, spaceType: "group" }), {
    handled: true,
  });
  assert.equal(group.calls.length, 1);
  assert.deepEqual(group.reads, ["message-1"]);
  assert.deepEqual(group.replies, ["**Done**"]);
  assert.deepEqual(group.events, ["info:received_group_message", "info:processed_group_message"]);
});

test("logs a safe rejection reason for an unallowed group sender", async () => {
  const group = fixture();
  group.message.sender.id = "+15557654321";

  assert.deepEqual(await group.relay.handle({ space: group.space, message: group.message, spaceType: "group" }), {
    handled: false,
  });
  assert.deepEqual(group.events, ["info:received_group_message", "info:ignored_group_unallowed_sender"]);
});

test("logs a safe rejection reason for non-text group content", async () => {
  const group = fixture();
  group.message.content = { type: "addMember", members: ["+15557654321"] };

  assert.deepEqual(await group.relay.handle({ space: group.space, message: group.message, spaceType: "group" }), {
    handled: false,
  });
  assert.deepEqual(group.events, ["info:received_group_message", "info:ignored_group_nontext_content"]);
});

test("rejects unsupported conversations and unknown senders without calling Assist", async () => {
  const unsupported = fixture();
  assert.deepEqual(await unsupported.relay.handle({ space: unsupported.space, message: unsupported.message, spaceType: "other" }), {
    handled: false,
  });
  assert.equal(unsupported.calls.length, 0);
  assert.deepEqual(unsupported.reads, []);

  const unknown = fixture();
  unknown.message.sender.id = "+15557654321";
  assert.deepEqual(await unknown.relay.handle({ space: unknown.space, message: unknown.message, spaceType: "dm" }), {
    handled: false,
  });
  assert.equal(unknown.calls.length, 0);
  assert.deepEqual(unknown.reads, []);
});

test("does not execute a duplicate message twice", async () => {
  const { relay, calls, reads, space, message } = fixture();
  await relay.handle({ space, message, spaceType: "dm" });
  const duplicate = await relay.handle({ space, message, spaceType: "dm" });
  assert.deepEqual(duplicate, { handled: false, duplicate: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(reads, ["message-1"]);
});

test("continues to Assist when marking a message read fails", async () => {
  const { relay, calls, space, message } = fixture();
  const warnings = [];
  message.read = async () => {
    throw new Error("read receipt unavailable");
  };
  const warningRelay = createRelay({
    config: {
      allowedSenders: new Set(["+15551234567"]),
      maxMessageChars: 4000,
      messageRetentionMs: 1000,
      conversationTtlMs: 1000,
      language: "en",
      agentId: "conversation.claude",
    },
    store: {
      claimMessage: async () => true,
      getConversation: async () => undefined,
      setConversation: async () => {},
      clearConversation: async () => {},
    },
    assistant: {
      process: async (input) => {
        calls.push(input);
        return { replyText: "Done", conversationId: "conversation-2" };
      },
    },
    logger: { debug() {}, info() {}, warning: (event) => warnings.push(event), error() {} },
    reply: async () => {},
  });

  assert.deepEqual(await warningRelay.handle({ space, message, spaceType: "dm" }), { handled: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(warnings, ["read_receipt_failed"]);
});

test("retries once without a stored conversation only when it is invalid", async () => {
  const { relay, calls, space, message } = fixture();
  let attempt = 0;
  const store = {
    claimMessage: async () => true,
    getConversation: async () => "stale-conversation",
    setConversation: async () => {},
    clearConversation: async () => {},
  };
  const assistant = {
    process: async (input) => {
      attempt += 1;
      calls.push(input);
      if (attempt === 1) {
        throw new HomeAssistantError({
          kind: "http",
          status: 400,
          body: { message: "Unknown conversation_id" },
        });
      }
      return { replyText: "Done", conversationId: "new-conversation" };
    },
  };
  const retryRelay = createRelay({
    config: {
      allowedSenders: new Set(["+15551234567"]),
      maxMessageChars: 4000,
      messageRetentionMs: 1000,
      conversationTtlMs: 1000,
      language: "en",
      agentId: "conversation.claude",
    },
    store,
    assistant,
    logger: { debug() {}, info() {}, warning() {}, error() {} },
    reply: async () => {},
  });

  await retryRelay.handle({ space, message, spaceType: "dm" });
  assert.equal(attempt, 2);
  assert.equal(calls[0].conversationId, "stale-conversation");
  assert.equal(calls[1].conversationId, undefined);
});
