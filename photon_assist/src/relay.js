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
    if (
      message.platform !== "imessage" ||
      message.direction !== "inbound" ||
      message.content?.type !== "text" ||
      spaceType !== "dm" ||
      !config.allowedSenders.has(message.sender?.id)
    ) {
      return { handled: false };
    }

    const text = message.content.text.trim();
    if (text === "" || text.length > config.maxMessageChars) {
      logger.warning("rejected_message_length");
      return { handled: false };
    }

    return queue.run(space.id, async () => {
      const claimed = await store.claimMessage(message.id, config.messageRetentionMs);
      if (!claimed) {
        logger.info("ignored_duplicate_message");
        return { handled: false, duplicate: true };
      }

      try {
        const replyText = await space.responding(() => processWithConversation(space.id, text));
        await reply(message, replyText);
        logger.info("processed_message");
        return { handled: true };
      } catch {
        logger.error("assist_or_reply_failed");
        try {
          await reply(message, "I couldn't reach Assist. Please try again.");
        } catch {
          logger.error("fallback_reply_failed");
        }
        return { handled: true, failed: true };
      }
    });
  }

  return { handle };
}

