import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(process.cwd(), ".output", "public");
const expectedManifestHref = process.env.GITHUB_ACTIONS
  ? "/neko-nap/manifest.webmanifest"
  : "/manifest.webmanifest";
const expectedFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "favicon.ico",
  "favicon.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "assets/neko-nap-cat.png",
  "assets/cat-purring.mp3",
  "assets/rain-sound.mp3",
  "assets/ocean-waves.mp3",
];

const failures = [];

for (const relativePath of expectedFiles) {
  const filePath = join(publicDir, relativePath);
  try {
    await access(filePath);
    if ((await stat(filePath)).size === 0) failures.push(`${relativePath} is empty`);
  } catch {
    failures.push(`${relativePath} is missing`);
  }
}

const html = await readFile(join(publicDir, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(join(publicDir, "manifest.webmanifest"), "utf8"));
const worker = await readFile(join(publicDir, "sw.js"), "utf8");
const assetFiles = await readdir(join(publicDir, "assets"));

if (!html.includes("<title>Neko Nap")) failures.push("index.html is missing the Neko Nap title");
if (!html.includes(expectedManifestHref)) {
  failures.push(`index.html is missing the expected manifest path: ${expectedManifestHref}`);
}
if (!assetFiles.some((name) => /^index-.*\.js$/.test(name))) {
  failures.push("client JavaScript bundle is missing");
}
if (!assetFiles.some((name) => /^styles-.*\.css$/.test(name))) {
  failures.push("compiled stylesheet is missing");
}
if (manifest.start_url !== "./" || manifest.scope !== "./") {
  failures.push("manifest start_url/scope are not portable under /neko-nap/");
}
for (const coreAsset of [
  "assets/neko-nap-cat.png",
  "assets/cat-purring.mp3",
  "assets/rain-sound.mp3",
  "assets/ocean-waves.mp3",
]) {
  if (!worker.includes(coreAsset)) failures.push(`offline worker does not cache ${coreAsset}`);
}

if (failures.length > 0) {
  console.error(
    "Deploy smoke check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Deploy smoke check passed (${expectedFiles.length} core files + app bundles).`);
