import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const url =
  "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261021/mpv-x86_64-20261021-git-e471496c56.7z";
const response = await fetch(url);
if (!response.ok) throw Error("mpv download failed");
const bytes = Buffer.from(await response.arrayBuffer());
const expected = fs
  .readFileSync(new URL("./mpv-sha256.txt", import.meta.url), "utf8")
  .trim();
if (createHash("sha256").update(bytes).digest("hex") !== expected)
  throw Error("mpv checksum mismatch");
fs.mkdirSync("vendor/mpv", { recursive: true });
fs.writeFileSync("vendor/mpv.7z", bytes);
execFileSync(
  require("7zip-bin").path7za,
  ["x", "vendor/mpv.7z", "mpv.exe", "-ovendor/mpv", "-y"],
  { stdio: "inherit" },
);
fs.unlinkSync("vendor/mpv.7z");

const executable=fs.readFileSync("vendor/mpv/mpv.exe");
if(createHash("sha256").update(executable).digest("hex")!=="8c2e4d24eb961723cc5e2f1f4401982836e82c96e0e0a944c0576090fc48993f")throw Error("mpv executable checksum mismatch");
