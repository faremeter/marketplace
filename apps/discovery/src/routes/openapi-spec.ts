import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const specYaml = readFileSync(join(__dirname, "../openapi.yaml"), "utf-8");

export const openapiSpecRoutes = new Hono();

openapiSpecRoutes.get("/", (c) => {
  return c.text(specYaml, 200, {
    "Content-Type": "text/yaml; charset=utf-8",
  });
});
