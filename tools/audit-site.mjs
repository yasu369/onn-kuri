import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const publicPages = [
  "index.html",
  "pricing/index.html",
  "flow/index.html",
  "diet/index.html",
  "stomach/index.html",
  "pill/index.html",
  "ed/index.html",
  "aga/index.html",
  "beauty/index.html",
  "contact/index.html",
  "limited-info/index.html",
  "privacy/index.html",
  "terms/index.html",
  "profile/index.html"
];
const categories = ["diet", "stomach", "pill", "ed", "aga", "beauty"];
const errors = [];
let footerLabels;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

for (const relativePath of publicPages) {
  const html = read(relativePath);
  const label = relativePath === "index.html" ? "/" : relativePath.replace(/\/index\.html$/, "/");

  for (const [name, pattern] of [
    ["title", /<title>[^<]+<\/title>/],
    ["description", /<meta\s+name="description"/],
    ["viewport", /<meta\s+name="viewport"/],
    ["canonical", /<link\s+rel="canonical"/],
    ["Google Analytics", /G-7JV03F8T1Q/],
    ["navigation", /class="site-nav"/],
    ["footer", /class="site-footer"/]
  ]) {
    if (!pattern.test(html)) errors.push(`${label}: missing ${name}`);
  }

  if (/(?:href|src)="\/(?!\/)/.test(html)) {
    errors.push(`${label}: root-relative asset or link found`);
  }

  for (const match of html.matchAll(/<a\b[^>]*data-config-reservation[^>]*>/g)) {
    if (!match[0].includes('href="https://lin.ee/PNBQpOa"')) {
      errors.push(`${label}: reservation link is not the official LINE URL`);
    }
  }

  for (const pattern of ["pochi-clinic", "pochi-clinick", "Pochikuri", "低容量ピル", "予約導線"]) {
    if (html.includes(pattern)) errors.push(`${label}: stale text found: ${pattern}`);
  }

  const footer = html.match(/<div class="footer-links">([\s\S]*?)<\/div>/)?.[1];
  if (!footer) {
    errors.push(`${label}: footer links not found`);
  } else {
    const labels = [...footer.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((match) => stripTags(match[1]));
    if (!footerLabels) footerLabels = labels;
    if (JSON.stringify(labels) !== JSON.stringify(footerLabels)) {
      errors.push(`${label}: footer link labels differ from the shared set`);
    }
  }
}

const pricing = read("pricing/index.html");
for (const category of categories) {
  if (!pricing.includes(`id="${category}"`)) errors.push(`pricing/: missing #${category} anchor`);
  const page = read(`${category}/index.html`);
  if (!page.includes(`pricing/#${category}`)) errors.push(`${category}/: missing pricing anchor link`);
}

const pill = read("pill/index.html");
const pillPriceSection = pill.match(/<section class="section price-section">([\s\S]*?)<\/section>/)?.[1] || "";
const pillRows = [...pillPriceSection.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((match) => [...match[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => stripTags(cell[1])))
  .filter((row) => row.length > 0);
if (pillRows.length === 0 || pillRows.some((row) => row.at(-1) !== "入荷待ち")) {
  errors.push("pill/: every price row must say 入荷待ち");
}

const news = JSON.parse(read("news.json"));
if (!Array.isArray(news) || news.length === 0 || news.length > 5) {
  errors.push("news.json: expected one to five note posts");
}

if (errors.length > 0) {
  console.error(`Audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Audit passed: ${publicPages.length} public pages, ${pillRows.length} pill price rows, ${news.length} note posts.`);
}
