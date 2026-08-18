import { readFileSync } from "node:fs";
import { createPasswordHash } from "../app/lib/server/auth.ts";

const password = process.argv[2] === "--stdin" ? readFileSync(0, "utf8").replace(/[\r\n]+$/, "") : process.argv[2];
if (!password || password.length < 12) {
  console.error("用法：npm run admin:hash -- <至少12位密码>，或通过标准输入传入并使用 --stdin");
  process.exit(1);
}
console.log(createPasswordHash(password));
