/**
 * The package version, read from package.json at runtime so the User-Agent and
 * the MCP handshake can never drift from what npm published. package.json is
 * always shipped in the npm tarball; from both src/ (tsx) and dist/ (node) it
 * sits one directory up.
 */
import { readFileSync } from "node:fs";

export const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
