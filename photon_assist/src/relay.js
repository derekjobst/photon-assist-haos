import { isInvalidConversationError } from "./home-assistant.js";

export function createSpaceQueue() {
  const tails = new Map();

  return {
    run(spaceId, task) {
      const previous = tails.get(spaceId) ?? Promise.resolve();
      const next = previous.then(task, task);
      tails.set(spaceId, next);
      next.finally(() => {
        if (tails.get(spaceId) === next) tails.delete(spaceId);
      }).catch(() => {});
      return next;
    },
  };
}

export function createRelay({ config, store, assistant, reply, logger, queue = createSpaceQueue() }) {
  async function processWithConversation(spaceId, text) {
    let conversationId = await store.getConversation(spaceId, config.conversationTtlMs);

    try {
      const result = await assistant.process({
        text,
        language: config.language,
        agentId: config.agentId,
        conversationId,
      });
      await store.setConversation(spaceId, result.conversationId);
      return result.replyText;
    } catch (error) {
      if (!conversationId || !isInvalidConversationError(error)) throw error;
      await store.clearConversation(spaceId);
      const result = await assistant.process({ text, language: config.language, agentId: config.agentId });
      await store.setConversation(spaceId, result.conversationId);
      return result.replyText;
    }
  }

  async function handle({ space, message, spaceType }) {
    const logGroup = (event, level = "info") => {
      if (spaceType === "group") logger[level](event);
    };

    logGroup("received_group_message");

    if (message.platform !== "imessage" || !["dm", "group"].includes(spaceType)) {
      return { handled: false };
    }

    if (message.direction !== "inbound") {
      logGroup("ignored_group_non_inbound_message");
      return { handled: false };
    }

    if (message.content?.type !== "text") {
      logGroup("ignored_group_nontext_content");
      return { handled: false };
    }

    if (!config.allowedSenders.has(message.sender?.id)) {
      logGroup("ignored_group_unallowed_sender");
      return { handled: false };
    }

    const text = message.content.text.trim();
    if (text === "" || text.length > config.maxMessageChars) {
      logGroup("rejected_group_message_length", "warning");
      if (spaceType !== "group") logger.warning("rejected_message_length");
      return { handled: false };
    }

    return queue.run(space.id, async () => {
      const claimed = await store.claimMessage(message.id, config.messageRetentionMs);
      if (!claimed) {
        logGroup("ignored_duplicate_group_message");
        if (spaceType !== "group") logger.info("ignored_duplicate_message");
        return { handled: false, duplicate: true };
      }

      try {
        await message.read();
      } catch {
        logGroup("group_read_receipt_failed", "warning");
        if (spaceType !== "group") logger.warning("read_receipt_failed");
      }

      try {
        const replyText = await space.responding(() => processWithConversation(space.id, text));
        await reply(message, replyText);
        logGroup("processed_group_message");
        if (spaceType !== "group") logger.info("processed_message");
        return { handled: true };
      } catch {
        logGroup("group_assist_or_reply_failed", "error");
        if (spaceType !== "group") logger.error("assist_or_reply_failed");
        try {
          await reply(message, "I couldn't reach Assist. Please try again.");
        } catch {
          logGroup("group_fallback_reply_failed", "error");
          if (spaceType !== "group") logger.error("fallback_reply_failed");
        }
        return { handled: true, failed: true };
      }
    });
  }

  return { handle };
}
