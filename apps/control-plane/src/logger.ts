import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import type { LogLevel } from "@logtape/logtape";

const logLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
    { category: "control-plane", lowestLevel: logLevel, sinks: ["console"] },
  ],
});

export const logger = getLogger(["control-plane"]);
