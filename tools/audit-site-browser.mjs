import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const viewports = [
  ["desktop", { width: 1280, height: 1000 }],
  ["mobile", { width: 390, height: 1000 }]
];

const targets = [
  {
    label: "index.html/ダイエット",
    selector: 'a[href="diet/"]',
    tokens: ["マンジャロ", "4本", "¥19,800〜"]
  },
  {
    label: "index.html/低用量ピル",
    selector: 'a[href="pill/"]',
    tokens: ["低用量ピル", "現在入荷待ち"]
  }
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function startStaticServer(root) {
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/" || pathname.endsWith("/")) pathname += "index.html";
      const filePath = path.resolve(root, "." + pathname);
      const relativePath = path.relative(root, filePath);

      if (relativePath.startsWith(".." + path.sep) || path.isAbsolute(relativePath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
        });
        response.end(data);
      });
    } catch (error) {
      response.writeHead(400);
      response.end("Bad request");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function inspectTarget(page, target) {
  return page.evaluate(({ selector, tokens }) => {
    const root = document.querySelector(selector);
    if (!root) return { count: 0, visible: {}, text: "" };

    function isRendered(element) {
      if (!element) return false;
      let current = element;
      while (current) {
        if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
        const style = getComputedStyle(current);
        if (
          style.display === "none" ||
          Number.parseFloat(style.opacity) === 0
        ) {
          return false;
        }
        current = current.parentElement;
      }
      const ownStyle = getComputedStyle(element);
      return ownStyle.visibility !== "hidden" && ownStyle.visibility !== "collapse";
    }

    function textNodes() {
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      return nodes;
    }

    const nodes = textNodes();
    const visibleTextParts = [];
    for (const node of nodes) {
      if (isRendered(node.parentElement)) {
        visibleTextParts.push(node.nodeValue);
      } else if (node.nodeValue.trim()) {
        // Keep hidden text from joining two visible fragments into a false match.
        visibleTextParts.push("\u0000");
      }
    }
    const text = visibleTextParts
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const visible = Object.fromEntries(tokens.map((token) => [token, text.includes(token)]));

    return { count: 1, visible, text };
  }, { selector: target.selector, tokens: target.tokens });
}

export async function auditRoot(root) {
  const errors = [];
  const measurements = [];
  let server;
  let browser;

  try {
    server = await startStaticServer(path.resolve(root));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("local audit server did not expose a port");
    const baseUrl = "http://127.0.0.1:" + address.port;

    browser = await chromium.launch({ headless: true });
    for (const [viewportName, viewport] of viewports) {
      const page = await browser.newPage({ viewport });
      await page.route("**/*", (route) => {
        const requestUrl = new URL(route.request().url());
        const isLocal = requestUrl.hostname === "127.0.0.1" && requestUrl.port === String(address.port);
        const isExternalStylesheet =
          route.request().resourceType() === "stylesheet" && requestUrl.hostname === "fonts.googleapis.com";
        if (isLocal || isExternalStylesheet) {
          return route.continue();
        }
        return route.abort();
      });

      try {
        await page.goto(baseUrl + "/", { waitUntil: "load" });
        const layout = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        }));
        measurements.push({
          viewport: viewportName,
          ...layout,
          horizontalOverflow: layout.scrollWidth > layout.clientWidth
        });

        for (const target of targets) {
          const inspection = await inspectTarget(page, target);
          if (inspection.count !== 1) {
            errors.push(
              target.label + ": link count mismatch; expected=1; actual=" + inspection.count +
              "; viewport=" + viewportName
            );
            continue;
          }
          const hiddenTokens = target.tokens.filter((token) => !inspection.visible[token]);
          if (hiddenTokens.length > 0) {
            errors.push(
              target.label + ": visibility mismatch; expected=visible " + JSON.stringify(target.tokens) +
              "; actual=hidden " + JSON.stringify(hiddenTokens) +
              "; viewport=" + viewportName + "; text=" + JSON.stringify(inspection.text)
            );
          }
        }
      } catch (error) {
        errors.push("browser/" + viewportName + ": page inspection failed; actual=" + error.message);
      } finally {
        await page.close();
      }
    }
  } catch (error) {
    errors.push("browser: startup failed; actual=" + error.message);
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }

  return { errors, measurements, status: errors.length === 0 ? 0 : 1 };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const root = process.env.AUDIT_SITE_ROOT || process.cwd();
  const result = await auditRoot(root);
  if (result.status !== 0) {
    console.error("Browser audit failed with " + result.errors.length + " issue(s):");
    for (const error of result.errors) console.error("- " + error);
    process.exitCode = 1;
  } else {
    console.log("Browser audit passed: " + JSON.stringify(result.measurements));
  }
}
