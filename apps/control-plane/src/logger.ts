import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
    { category: "control-plane", lowestLevel: "info", sinks: ["console"] },
  ],
});

export const logger = getLogger(["control-plane"]);
