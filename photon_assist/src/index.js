import { Spectrum, markdown } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { loadConfig } from "./config.js";
import { ConversationStore } from "./conversation-store.js";
import { createHomeAssistantClient } from "./home-assistant.js";
import { createLogger } from "./logger.js";
import { createRelay } from "./relay.js";

async function main() {
  const config = await loadConfig();
  const logger = createLogger(config.logLevel);
  const store = new ConversationStore();
  await store.initialize();

  const assistant = createHomeAssistantClient({ supervisorToken: process.env.SUPERVISOR_TOKEN });
  const app = await Spectrum({
    projectId: config.spectrumProjectId,
    projectSecret: config.spectrumProjectSecret,
    providers: [imessage.config()],
  });

  const relay = createRelay({
    config,
    store,
    assistant,
    logger,
    reply: (message, text) => message.reply(markdown(text)),
  });

  logger.info("started");
  for await (const [space, message] of app.messages) {
    const spaceType = message.platform === "imessage" ? imessage(space).type : undefined;
    void relay.handle({ space, message, spaceType }).catch(() => {
      logger.error(spaceType === "group" ? "group_message_handling_failed" : "message_handling_failed");
    });
  }
}

main().catch((error) => {
  const message = error?.name === "ConfigurationError" ? "configuration_error" : "startup_failed";
  console.error(`[photon-assist] ${message}`);
  process.exitCode = 1;
});
