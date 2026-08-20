import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "../src/conversation-store.js";

test("persists conversation IDs and prevents duplicate message claims", async () => {
  let now = 1_000;
  const path = join(await mkdtemp(join(tmpdir(), "photon-assist-")), "state.json");
  const store = new ConversationStore({ path, now: () => now });
  await store.initialize();
  await store.setConversation("dm-1", "conversation-1");
  assert.equal(await store.claimMessage("message-1", 1_000), true);
  assert.equal(await store.claimMessage("message-1", 1_000), false);

  const restarted = new ConversationStore({ path, now: () => now });
  await restarted.initialize();
  assert.equal(await restarted.getConversation("dm-1", 1_000), "conversation-1");
  assert.equal(await restarted.claimMessage("message-1", 1_000), false);
});

test("expires stale conversations and old message IDs", async () => {
  let now = 1_000;
  const path = join(await mkdtemp(join(tmpdir(), "photon-assist-")), "state.json");
  const store = new ConversationStore({ path, now: () => now });
  await store.initialize();
  await store.setConversation("dm-1", "conversation-1");
  await store.claimMessage("message-1", 100);
  now = 1_101;
  assert.equal(await store.getConversation("dm-1", 100), undefined);
  assert.equal(await store.claimMessage("message-1", 100), true);
});

