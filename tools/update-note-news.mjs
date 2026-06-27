import fs from "node:fs/promises";

const configText = await fs.readFile("config.js", "utf8");
const rssUrl = configText.match(/noteRssUrl:\s*"([^"]*)"/)?.[1];

if (!rssUrl) {
  console.log("noteRssUrl is empty. Keeping existing news.json.");
  process.exit(0);
}

const response = await fetch(rssUrl);

if (!response.ok) {
  throw new Error(`Failed to fetch note RSS: ${response.status}`);
}

const xml = await response.text();
const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].slice(0, 5).map((match) => {
  const item = match[0];

  return {
    title: decodeXml(item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)?.[1] || item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)?.[2] || ""),
    url: decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ""),
    date: toDate(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "")
  };
}).filter((item) => item.title && item.url);

await fs.writeFile("news.json", `${JSON.stringify(items, null, 2)}\n`, "utf8");

function toDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
