#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..");
const pluginId = "opencode-chat-bot";
const packageName = "@luoyingwen/opencode-chat-bot";

const colors = {
  bold: "\u001b[1m",
  info: "\u001b[38;2;136;146;176m",
  success: "\u001b[38;2;0;229;204m",
  warn: "\u001b[38;2;255;176;0m",
  error: "\u001b[38;2;230;57;70m",
  reset: "\u001b[0m",
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(color, text = "") {
  process.stdout.write(`${colorize(color, text)}\n`);
}

function fail(message) {
  process.stderr.write(`${colorize("error", message)}\n`);
  process.exit(1);
}

function quoteWindowsShellArg(value) {
  return `"${String(value).replace(/"/gu, '\\"')}"`;
}

function run(command, args, options = {}) {
  if (process.platform === "win32") {
    return spawnSync([command, ...args.map(quoteWindowsShellArg)].join(" "), {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: true,
      ...options,
    });
  }

  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
}

function checkBuild() {
  const pluginEntry = resolve(repositoryRoot, "dist", "openclaw-plugin.js");
  if (!existsSync(pluginEntry)) {
    fail("OpenClaw plugin is not built. Run `npm run build:openclaw` first.");
  }
}

function checkOpenClaw() {
  const result = run("openclaw", ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    fail("OpenClaw CLI not found in PATH. Install OpenClaw first, then rerun this script.");
  }
}

function cleanupInstallStages() {
  const extensionsDir = resolve(homedir(), ".openclaw", "extensions");
  if (!existsSync(extensionsDir)) {
    return;
  }

  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(".openclaw-install-stage-")) {
      continue;
    }

    rmSync(resolve(extensionsDir, entry.name), {
      recursive: true,
      force: true,
      maxRetries: 2,
    });
  }
}

function createTarball() {
  log("bold", "Creating npm tarball...");
  const result = run("npm", ["pack"], { stdio: "pipe" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    fail("Failed to create npm tarball.");
  }

  const tarball = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .at(-1);

  if (!tarball) {
    fail("Failed to find npm tarball name in `npm pack` output.");
  }

  log("success", `Created: ${tarball}`);
  return resolve(repositoryRoot, tarball);
}

function runOpenClawInstall(args) {
  const result = run("openclaw", ["plugins", "install", ...args], { stdio: "pipe" });
  const output = `${result.stdout || ""}${result.stderr || ""}`
    .split(/\r?\n/u)
    .filter((line) => line && !line.includes("install-stage"))
    .join("\n");

  if (output) {
    process.stdout.write(`${output}\n`);
  }

  if (result.status !== 0) {
    fail("OpenClaw plugin installation failed.");
  }
}

function enablePlugin() {
  log("bold", "Enabling plugin...");
  const result = run("openclaw", ["config", "set", `plugins.entries.${pluginId}.config.enabled`, "true"], {
    stdio: "pipe",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`
    .split(/\r?\n/u)
    .filter((line) => line && !line.includes("Config warnings"))
    .join("\n");

  if (output) {
    process.stdout.write(`${output}\n`);
  }

  if (result.status !== 0) {
    log("warn", "Failed to enable plugin automatically. Enable manually:");
    log("info", `  openclaw config set plugins.entries.${pluginId}.enabled true`);
  } else {
    log("success", "Plugin enabled.");
  }
}

function installLocal() {
  log("bold", "Installing OpenClawCode locally from a packed package...");
  checkBuild();
  checkOpenClaw();
  cleanupInstallStages();

  const tarballPath = createTarball();
  try {
log("info", `Installing from tarball: ${tarballPath}`);
  runOpenClawInstall(["--force", tarballPath]);
  } finally {
    rmSync(tarballPath, { force: true });
    cleanupInstallStages();
  }

  process.stdout.write("\n");
  log("success", "Local installation complete.");
  enablePlugin();
}

function installLink() {
  log("bold", "Linking OpenClawCode locally...");
  checkBuild();
  checkOpenClaw();
  cleanupInstallStages();

  log("info", `Linking from: ${repositoryRoot}`);
  runOpenClawInstall(["--link", "--force", repositoryRoot]);
  cleanupInstallStages();

  process.stdout.write("\n");
  log("success", "Linked installation complete.");
  log("warn", "Linked installs use this working tree; rebuild after source changes.");
  enablePlugin();
}

function showInfo() {
  log("bold", "OpenClawCode Install Script");
  process.stdout.write("\n");
  log("info", "Build first: npm run build:openclaw");
  process.stdout.write("\n");
  log("bold", "Local testing:");
  log("success", "  npm run openclaw:install -- local");
  log("info", "  Install from an npm tarball for integration testing");
  process.stdout.write("\n");
  log("success", "  npm run openclaw:install -- link");
  log("info", "  Link this working tree with OpenClaw --link mode");
  process.stdout.write("\n");
  log("bold", "Installing from npm after publish:");
  log("success", `  openclaw plugins install ${packageName}`);
}

function dryRunPublish() {
  checkBuild();
  log("bold", "Dry run: checking package contents");
  const result = run("npm", ["pack", "--dry-run"], { stdio: "inherit" });
  if (result.status !== 0) {
    fail("npm pack --dry-run failed.");
  }
}

function showHelp() {
  log("bold", "OpenClawCode Install Script");
  process.stdout.write("\n");
  process.stdout.write("Usage: npm run openclaw:install -- [command]\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  info       Show installation info (default)\n");
  process.stdout.write("  local      Install locally from a packed tarball\n");
  process.stdout.write("  link       Link this working tree through OpenClaw --link mode\n");
  process.stdout.write("  publish    Dry-run npm package contents\n");
  process.stdout.write("  help       Show this help\n");
}

function main() {
  const command = process.argv[2] || "info";
  switch (command) {
    case "info":
      showInfo();
      break;
    case "local":
      installLocal();
      break;
    case "link":
      installLink();
      break;
    case "publish":
      dryRunPublish();
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      showHelp();
      fail(`Unknown command: ${command}`);
  }
}

main();
