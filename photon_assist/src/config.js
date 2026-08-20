import { readFile } from "node:fs/promises";

const E164 = /^\+[1-9]\d{1,14}$/;
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigurationError(`${name} must be configured`);
  }
  return value.trim();
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConfigurationError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export function parseConfig(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ConfigurationError("options must be an object");
  }

  const allowedSenders = options.allowed_senders;
  if (!Array.isArray(allowedSenders) || allowedSenders.length === 0) {
    throw new ConfigurationError("allowed_senders must contain at least one sender");
  }

  const normalizedSenders = allowedSenders.map((sender) => {
    const value = requiredString(sender, "allowed_senders entry");
    if (!E164.test(value)) {
      throw new ConfigurationError("allowed_senders entries must be E.164 telephone numbers");
    }
    return value;
  });

  if (new Set(normalizedSenders).size !== normalizedSenders.length) {
    throw new ConfigurationError("allowed_senders entries must be unique");
  }

  const language = requiredString(options.language ?? "en", "language");
  if (!LANGUAGE_TAG.test(language)) {
    throw new ConfigurationError("language must be a language tag");
  }

  const logLevel = options.log_level ?? "info";
  if (!["debug", "info", "warning", "error"].includes(logLevel)) {
    throw new ConfigurationError("log_level is invalid");
  }

  return {
    logLevel,
    spectrumProjectId: requiredString(options.spectrum_project_id, "spectrum_project_id"),
    spectrumProjectSecret: requiredString(options.spectrum_project_secret, "spectrum_project_secret"),
    allowedSenders: new Set(normalizedSenders),
    language,
    agentId: requiredString(options.agent_id ?? "conversation.claude", "agent_id"),
    conversationTtlMs:
      boundedInteger(options.conversation_ttl_minutes ?? 1440, "conversation_ttl_minutes", 1, 10080) *
      60_000,
    messageRetentionMs:
      boundedInteger(options.message_retention_days ?? 7, "message_retention_days", 1, 30) *
      86_400_000,
    maxMessageChars: boundedInteger(options.max_message_chars ?? 4000, "max_message_chars", 1, 10_000),
  };
}

export async function loadConfig(path = "/data/options.json") {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new ConfigurationError("could not read Home Assistant options");
  }

  try {
    return parseConfig(JSON.parse(source));
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError("Home Assistant options are not valid JSON");
  }
}

