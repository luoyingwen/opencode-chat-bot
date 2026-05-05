import fs from "node:fs/promises";
import { Mutex } from "async-mutex";
import { getRuntimePaths } from "./paths.js";
import { reloadConfig } from "../config.js";
import { logger } from "../utils/logger.js";

const mutex = new Mutex();

export async function updateEnvValue(key: string, value: string): Promise<boolean> {
  const release = await mutex.acquire();

  try {
    const current = process.env[key];
    if (current?.trim()) {
      logger.info(`[EnvUpdater] ${key} already set to "${current}", skip update`);
      return false;
    }

    const paths = getRuntimePaths();
    let content = "";
    try {
      content = await fs.readFile(paths.envFilePath, "utf-8");
    } catch {
      logger.info(`[EnvUpdater] .env file not found, will create new`);
    }

    const lines = content.split("\n");
    const existingLineIndex = lines.findIndex((l) => l.startsWith(`${key}=`));

    if (existingLineIndex >= 0) {
      lines[existingLineIndex] = `${key}=${value}`;
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(`${key}=${value}`);
    }

    await fs.writeFile(paths.envFilePath, lines.join("\n"), "utf-8");
    logger.info(`[EnvUpdater] Updated ${key}="${value}" in .env`);

    reloadConfig();

    return true;
  } finally {
    release();
  }
}
