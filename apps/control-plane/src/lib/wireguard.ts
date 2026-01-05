import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../logger.js";

const execAsync = promisify(exec);

export async function regenWireguardConfig() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info("[DEV] skipped wg-peers trigger");
    return true;
  }

  try {
    await execAsync("sudo systemctl start wg-peers");
    logger.info("triggered wg-peers service");
    return true;
  } catch (err) {
    logger.error(`failed to trigger wg-peers: ${err}`);
    return false;
  }
}
