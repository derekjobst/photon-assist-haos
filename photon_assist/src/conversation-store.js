import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const EMPTY_STATE = () => ({ version: 1, conversations: {}, processedMessages: {} });

function validState(value) {
  return (
    value &&
    value.version === 1 &&
    typeof value.conversations === "object" &&
    !Array.isArray(value.conversations) &&
    typeof value.processedMessages === "object" &&
    !Array.isArray(value.processedMessages)
  );
}

export class ConversationStore {
  constructor({ path = "/data/state.json", now = () => Date.now() } = {}) {
    this.path = path;
    this.now = now;
    this.state = EMPTY_STATE();
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      if (!validState(parsed)) throw new Error("invalid state");
      this.state = parsed;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        this.state = EMPTY_STATE();
      }
    }
  }

  async claimMessage(messageId, retentionMs) {
    this.pruneProcessedMessages(retentionMs);
    if (this.state.processedMessages[messageId]) return false;
    this.state.processedMessages[messageId] = this.now();
    await this.persist();
    return true;
  }

  async getConversation(spaceId, ttlMs) {
    const record = this.state.conversations[spaceId];
    if (!record) return undefined;
    if (this.now() - record.updatedAt > ttlMs) {
      delete this.state.conversations[spaceId];
      await this.persist();
      return undefined;
    }
    return record.conversationId;
  }

  async setConversation(spaceId, conversationId) {
    if (typeof conversationId !== "string" || conversationId === "") return;
    this.state.conversations[spaceId] = { conversationId, updatedAt: this.now() };
    await this.persist();
  }

  async clearConversation(spaceId) {
    if (!(spaceId in this.state.conversations)) return;
    delete this.state.conversations[spaceId];
    await this.persist();
  }

  pruneProcessedMessages(retentionMs) {
    const oldestAllowed = this.now() - retentionMs;
    for (const [messageId, processedAt] of Object.entries(this.state.processedMessages)) {
      if (!Number.isFinite(processedAt) || processedAt < oldestAllowed) {
        delete this.state.processedMessages[messageId];
      }
    }
  }

  async persist() {
    const write = this.writeChain.catch(() => {}).then(async () => {
      const temporaryPath = join(dirname(this.path), `.${randomUUID()}.tmp`);
      await writeFile(temporaryPath, JSON.stringify(this.state), { mode: 0o600 });
      await rename(temporaryPath, this.path);
    });
    this.writeChain = write;
    return write;
  }
}
