import { existsSync, readFileSync } from "node:fs";

for (const file of [
  "worker/index.js",
  "public/index.html",
  "public/mascot.jpg",
  "public/manifest.json",
  "public/sw.js",
  "migrations/0000_gossip_auth.sql",
]) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
}

const html = readFileSync("public/index.html", "utf8");
if (html.includes("123456") || html.includes("gossipStudent")) {
  throw new Error("Demo authentication code is still present");
}

console.log("Gossip BH Cloudflare package is ready");
