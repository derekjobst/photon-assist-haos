import test from "node:test";
import assert from "node:assert/strict";
import { ConfigurationError, parseConfig } from "../src/config.js";

const valid = () => ({
  spectrum_project_id: "project-id",
  spectrum_project_secret: "secret",
  allowed_senders: ["+15551234567"],
  agent_id: "conversation.claude",
});

test("parses a safe DM-only configuration", () => {
  const config = parseConfig(valid());
  assert.equal(config.allowedSenders.has("+15551234567"), true);
  assert.equal(config.agentId, "conversation.claude");
  assert.equal(config.conversationTtlMs, 86_400_000);
});

test("rejects an empty sender allowlist", () => {
  const options = valid();
  options.allowed_senders = [];
  assert.throws(() => parseConfig(options), ConfigurationError);
});

test("rejects malformed E.164 sender numbers", () => {
  const options = valid();
  options.allowed_senders = ["15551234567"];
  assert.throws(() => parseConfig(options), ConfigurationError);
});

