import { existsSync, readFileSync } from "node:fs";

for (const file of [
  "index.js",
  "index.html",
  "mascot.jpg",
  "manifest.json",
  "sw.js",
  "0000_gossip_auth.sql",
  "0001_social_app.sql",
  "admin.html",
  "wrangler.jsonc",
]) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
}

const html = readFileSync("index.html", "utf8");
if (html.includes("123456") || html.includes("gossipStudent")) {
  throw new Error("Demo authentication code is still present");
}

const worker = readFileSync("index.js", "utf8");
if (!worker.includes('const ADMIN_EMAIL = "iabbas05@icloud.com"')) {
  throw new Error("The Super Admin identity is not configured correctly");
}
if (!worker.includes('isAdminHost')) {
  throw new Error("Admin API host isolation is missing");
}

const wrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (!wrangler.r2_buckets?.some((item) => item.binding === "MEDIA" && item.bucket_name === "gossip-bh-media")) {
  throw new Error("R2 media binding is missing");
}

console.log("Gossip BH Cloudflare package is ready");
