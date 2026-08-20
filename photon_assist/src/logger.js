const levelRank = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

export function createLogger(level = "info", output = console) {
  const threshold = levelRank[level] ?? levelRank.info;

  function log(messageLevel, event) {
    if (levelRank[messageLevel] < threshold) return;
    const method = messageLevel === "warning" ? "warn" : messageLevel;
    output[method](`[photon-assist] ${event}`);
  }

  return {
    debug: (event) => log("debug", event),
    info: (event) => log("info", event),
    warning: (event) => log("warning", event),
    error: (event) => log("error", event),
  };
}

