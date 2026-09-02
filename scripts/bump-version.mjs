#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const manifestPath = new URL("../manifest.json", import.meta.url);
const bump = process.argv[2];
const allowedBumps = new Set(["patch", "minor", "major"]);

if (!allowedBumps.has(bump)) {
  console.error("Usage: node scripts/bump-version.mjs <patch|minor|major>");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const versionPattern = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){0,2}$/;

if (!versionPattern.test(manifest.version)) {
  throw new Error(`Invalid Chrome extension version: ${manifest.version}`);
}

const parts = manifest.version.split(".").map(Number);
while (parts.length < 3) parts.push(0);

let nextVersion;
switch (bump) {
  case "major":
    nextVersion = [parts[0] + 1, 0, 0];
    break;
  case "minor":
    nextVersion = [parts[0], parts[1] + 1, 0];
    break;
  default:
    nextVersion = [parts[0], parts[1], parts[2] + 1];
}

if (nextVersion.some((part) => part > 65535)) {
  throw new Error("Chrome extension version components cannot exceed 65535");
}

manifest.version = nextVersion.join(".");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(manifest.version);
