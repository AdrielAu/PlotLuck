// Shared setup for the real-browser flows: serve web/ locally and route the pinned CDN
// libraries (Leaflet, Three.js) to the isolated test install. Map tiles are never fetched.
// Set PLOTLUCK_PLAYWRIGHT to its module URL and PLOTLUCK_BROWSER to a Chromium executable if needed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const playwright = import.meta.resolve(process.env.PLOTLUCK_PLAYWRIGHT ?? "playwright");
const { chromium } = await import(playwright);
const modules = new URL("../", playwright);
const types = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", csv: "text/csv" };

// A browser and the site's URL, both closed when test `t` ends.
export async function openSite(t) {
  const root = new URL("../../web/", import.meta.url);
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = new URL(`.${path === "/" ? "/index.html" : path}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[file.pathname.split(".").at(-1)] ?? "text/plain" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // SwiftShader gives headless Chromium WebGL for the kitchen.
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    ...(process.env.PLOTLUCK_BROWSER ? { executablePath: process.env.PLOTLUCK_BROWSER } : {}),
  });
  // Release connections even after a failed assertion or pending browser request.
  t.after(async () => {
    server.closeAllConnections();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }, { timeout: 15_000 });
  return { browser, url: `http://127.0.0.1:${server.address().port}/` };
}

// A page with the CDN routes in place and page errors collected into `errors`.
export async function newPage(browser, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...options });
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({ body: await readFile(new URL(`leaflet/dist/${name}`, modules)), contentType: types[name.split(".").at(-1)] });
  });
  await page.route("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js", async (route) => {
    await route.fulfill({ body: await readFile(new URL("three/build/three.module.min.js", modules)), contentType: "text/javascript" });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  return page;
}
