// Makes sure the "vestacontrol" D1 database exists in your Cloudflare account and
// writes its id into wrangler.toml, so a first deploy needs no manual setup.
// Runs in CI before every deploy; safe to run repeatedly.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAME = "vestacontrol";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

function findId() {
  const list = JSON.parse(wrangler("d1", "list", "--json"));
  return list.find((db) => db.name === NAME)?.uuid;
}

let id = findId();
if (!id) {
  console.log(`Creating D1 database "${NAME}"…`);
  wrangler("d1", "create", NAME);
  id = findId();
}
if (!id) throw new Error(`Could not find or create D1 database "${NAME}"`);

const toml = readFileSync("wrangler.toml", "utf8");
writeFileSync("wrangler.toml", toml.replace(/database_id = "[^"]*"/, `database_id = "${id}"`));
console.log(`Using D1 database ${NAME} (${id})`);
