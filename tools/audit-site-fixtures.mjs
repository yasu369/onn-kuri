import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const nodeExecutable = process.execPath;

function copyRepository() {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "onn-kuri-audit-"));
  const excluded = new Set([".git", "node_modules"]);
  fs.cpSync(repositoryRoot, destination, {
    recursive: true,
    filter: (source) => !excluded.has(path.basename(source))
  });
  return destination;
}

function replaceOnce(filePath, before, after) {
  const original = fs.readFileSync(filePath, "utf8");
  if (!original.includes(before)) {
    throw new Error("Fixture marker not found in " + filePath + ": " + before);
  }
  fs.writeFileSync(filePath, original.replace(before, after), "utf8");
}

function ensureOnce(filePath, before, after) {
  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(after)) return;
  replaceOnce(filePath, before, after);
}

function insertBeforeBodyEnd(filePath, content) {
  replaceOnce(filePath, "</body>", content + "\n</body>");
}

function runAudit(directory) {
  return spawnSync(nodeExecutable, ["tools/audit-site.mjs"], {
    cwd: directory,
    encoding: "utf8"
  });
}

function outputOf(result) {
  return (result.stdout || "") + "\n" + (result.stderr || "");
}

function assertFragments(name, result, fragments) {
  const output = outputOf(result);
  if (result.status === 0) {
    throw new Error(name + " was accepted unexpectedly.\n" + output);
  }
  const diagnosticLines = output.split(/\r?\n/).filter((line) => line.includes("mismatch"));
  const matchingLine = diagnosticLines.find((line) => fragments.every((fragment) => line.includes(fragment)));
  if (!matchingLine) {
    throw new Error(
      name + " failed without one diagnostic containing " + JSON.stringify(fragments) + ".\n" + output
    );
  }
}

function assertPassed(name, result) {
  if (result.status !== 0) {
    throw new Error(name + " failed unexpectedly.\n" + outputOf(result));
  }
}

function makeCompliantFixture(directory) {
  const limitedPath = path.join(directory, "limited-info/index.html");
  for (const price of ["19,800", "32,800", "42,800", "52,800", "62,800", "72,800"]) {
    ensureOnce(limitedPath, "¥" + price + "</td>", "¥" + price + "/月</td>");
  }
  ensureOnce(
    limitedPath,
    "<th>お薬名称</th><th>規格</th><th>料金</th>",
    "<th>お薬名称</th><th>規格</th><th>数量</th><th>料金</th>"
  );
  ensureOnce(
    limitedPath,
    "<td>ボグリボース</td><td>0.3mg</td><td>¥3,300</td>",
    "<td>ボグリボース</td><td>0.3mg</td><td>60錠</td><td>¥3,300</td>"
  );
  ensureOnce(
    limitedPath,
    "<td>アカルボース</td><td>100mg</td><td>¥5,500</td>",
    "<td>アカルボース</td><td>100mg</td><td>90錠</td><td>¥5,500</td>"
  );
  ensureOnce(
    limitedPath,
    "<td>エゼチミブ</td><td>10mg</td><td>¥4,790</td>",
    "<td>エゼチミブ</td><td>10mg</td><td>30錠</td><td>¥4,790</td>"
  );
}

const compliant = copyRepository();
try {
  makeCompliantFixture(compliant);
  const result = runAudit(compliant);
  if (result.status !== 0) {
    throw new Error("Synthetic compliant fixture did not pass.\n" + outputOf(result));
  }
  console.log("Fixture passed: synthetic compliant data");
} finally {
  fs.rmSync(compliant, { recursive: true, force: true });
}

const reorderedMinimum = copyRepository();
try {
  makeCompliantFixture(reorderedMinimum);
  const pricingPath = path.join(reorderedMinimum, "pricing/index.html");
  const pricingOriginal = fs.readFileSync(pricingPath, "utf8");
  const firstPlan = '<tr><td>初回量2.5mg</td><td>4本 ¥19,800/月</td></tr>';
  const secondPlan = '<tr><td>維持量5mg</td><td>4本 ¥32,800/月</td></tr>';
  if (!pricingOriginal.includes(firstPlan) || !pricingOriginal.includes(secondPlan)) {
    throw new Error("Fixture markers not found for minimum-price ordering test");
  }
  const reorderedPricing = pricingOriginal
    .replace(firstPlan, "__FIRST_MOUNJARO_PLAN__")
    .replace(secondPlan, firstPlan)
    .replace("__FIRST_MOUNJARO_PLAN__", secondPlan);
  fs.writeFileSync(pricingPath, reorderedPricing, "utf8");
  const result = runAudit(reorderedMinimum);
  assertPassed("top minimum price is not tied to first row", result);
  console.log("Fixture passed: top minimum price is selected from matching plans");
} finally {
  fs.rmSync(reorderedMinimum, { recursive: true, force: true });
}

const adjacentHidden = copyRepository();
try {
  makeCompliantFixture(adjacentHidden);
  const indexPath = path.join(adjacentHidden, "index.html");
  replaceOnce(
    indexPath,
    "<small>マンジャロ4本 ¥19,800〜</small>",
    '<span hidden></span><small>マンジャロ4本 ¥19,800〜</small>'
  );
  const result = runAudit(adjacentHidden);
  assertPassed("unrelated adjacent hidden element does not hide the price", result);
  console.log("Fixture passed: unrelated adjacent hidden element does not hide the price");
} finally {
  fs.rmSync(adjacentHidden, { recursive: true, force: true });
}

const visibleSplit = copyRepository();
try {
  makeCompliantFixture(visibleSplit);
  const indexPath = path.join(visibleSplit, "index.html");
  replaceOnce(
    indexPath,
    "<small>マンジャロ4本 ¥19,800〜</small>",
    "<small><span>マンジャロ4本 </span><span>¥19,800〜</span></small>"
  );
  const result = runAudit(visibleSplit);
  assertPassed("visible split price summary", result);
  console.log("Fixture passed: visible split price summary");
} finally {
  fs.rmSync(visibleSplit, { recursive: true, force: true });
}

const cases = [
  {
    name: "one price mismatch",
    fragments: ["diet/マンジャロ", "4本 ¥19,801/月", "4本 ¥19,800/月"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "pricing/index.html"),
        "4本 ¥19,800/月",
        "4本 ¥19,801/月"
      );
    }
  },
  {
    name: "Mounjaro four-bottle quantity removed",
    fragments: ["diet/マンジャロ", "4本", "¥19,800/月"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "diet/index.html"),
        "4本 ¥19,800/月",
        "¥19,800/月"
      );
    }
  },
  {
    name: "Mounjaro four-bottle header removed",
    fragments: ["limited-info/マンジャロ", "table headers", "料金（4本）", "料金"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "<th>料金（4本）</th>",
        "<th>料金</th>"
      );
    }
  },
  {
    name: "quantity changed",
    fragments: ["diet/マンジャロ", "4本", "3本"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "diet/index.html"),
        "4本 ¥32,800/月",
        "3本 ¥32,800/月"
      );
    }
  },
  {
    name: "unmapped price row added",
    fragments: ["beauty/美容", "unexpected row", "未知の薬", "¥1"],
    mutate: (directory) => {
      const filePath = path.join(directory, "beauty/index.html");
      const original = fs.readFileSync(filePath, "utf8");
      const marker = "<tbody>";
      const row = "<tr><td>未知の薬</td><td>1mg</td><td>¥1</td></tr>";
      if (!original.includes(marker)) {
        throw new Error("Fixture marker not found in " + filePath + ": " + marker);
      }
      fs.writeFileSync(filePath, original.replace(marker, marker + row), "utf8");
    }
  },
  {
    name: "unknown appended table",
    fragments: ["beauty/index.html", "table count", "expected=1", "actual=2"],
    mutate: (directory) => {
      insertBeforeBodyEnd(
        path.join(directory, "beauty/index.html"),
        '<table><tr><th>未知</th></tr><tr><td>¥1,000</td></tr></table>'
      );
    }
  },
  {
    name: "unparsed table caption price",
    fragments: ["beauty/index.html/table 1", "unparsed table content", "追加薬 ¥99,999"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "beauty/index.html"),
        "<table>",
        "<table><caption>追加薬 ¥99,999</caption>"
      );
    }
  },
  {
    name: "unparsed table row price",
    fragments: ["beauty/index.html/table 1/row", "unparsed table row", "追加薬 ¥99,999"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "beauty/index.html"),
        "<tbody>",
        "<tbody><tr>追加薬 ¥99,999</tr>"
      );
    }
  },
  {
    name: "unmapped outside-table price",
    fragments: ["diet/index.html", "unmapped outside-table pricing", "¥1,000"],
    mutate: (directory) => {
      insertBeforeBodyEnd(path.join(directory, "diet/index.html"), "<p>マンジャロ4本 ¥1,000</p>");
    }
  },
  {
    name: "unmapped fullwidth-yen price",
    fragments: ["diet/index.html", "unmapped outside-table pricing", "¥99,999"],
    mutate: (directory) => {
      insertBeforeBodyEnd(path.join(directory, "diet/index.html"), "<p>マンジャロ4本 ￥99,999</p>");
    }
  },
  {
    name: "unmapped fullwidth-number price",
    fragments: ["diet/index.html", "unmapped outside-table pricing", "¥99,999"],
    mutate: (directory) => {
      insertBeforeBodyEnd(path.join(directory, "diet/index.html"), "<p>マンジャロ4本 ￥９９，９９９</p>");
    }
  },
  {
    name: "extra price in reservation block",
    fragments: ["index.html/料金案内", "reservation fee amounts", "0円", "¥99,999"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<h2>通院不要・診察料0円</h2>",
        "<h2>通院不要・診察料0円</h2><p>追加料金 ¥99,999</p>"
      );
    }
  },
  {
    name: "extra reservation block",
    fragments: ["index.html/料金案内", "cta-section block count", "expected=1", "actual=2"],
    mutate: (directory) => {
      insertBeforeBodyEnd(
        path.join(directory, "index.html"),
        '<section class="cta-section"><p>追加料金 ¥99,999</p></section>'
      );
    }
  },
  {
    name: "unparsed second table caption price",
    fragments: ["beauty/index.html/table 1", "unparsed table content", "追加薬 ¥99,999"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "beauty/index.html"),
        "<table>",
        "<table><caption>薬剤一覧</caption><caption>追加薬 ¥99,999</caption>"
      );
    }
  },
  {
    name: "wrong Mounjaro strength 102.5mg",
    fragments: ["limited-info/index.html/マンジャロ", "unparsed row strength", "one mapped dose", "102.5mg"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "<td>2.5mg</td>",
        "<td>102.5mg</td>"
      );
    }
  },
  {
    name: "wrong Mounjaro period 99 months",
    fragments: ["limited-info/index.html/マンジャロ/2.5mg", "period", "/月", "99ヶ月分"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "¥19,800/月",
        "¥19,800（99ヶ月分）"
      );
    }
  },
  {
    name: "second price in one Mounjaro cell",
    fragments: ["limited-info/index.html/マンジャロ", "price tokens", "one price token", "¥1"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "¥19,800/月",
        "¥19,800/月 / ¥1"
      );
    }
  },
  {
    name: "top wrong price with hidden correct text",
    fragments: ["index.html/ダイエット", "scoped summary", "¥19,800", "¥1"],
    mutate: (directory) => {
      const filePath = path.join(directory, "index.html");
      replaceOnce(filePath, "マンジャロ4本 ¥19,800〜", "マンジャロ4本 ¥1〜");
      insertBeforeBodyEnd(filePath, '<span hidden>マンジャロ4本 ¥19,800〜</span>');
    }
  },
  {
    name: "top quantity hidden while price visible",
    browser: true,
    fragments: ["index.html/ダイエット", "scoped summary", "ダイエットマンジャロ4本", "ダイエット¥19,800〜"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<small>マンジャロ4本 ¥19,800〜</small>",
        '<small><span hidden>マンジャロ4本 </span><span>¥19,800〜</span></small>'
      );
    }
  },
  {
    name: "top diet price hidden",
    browser: true,
    fragments: ["index.html/ダイエット", "visibility", "visible", "hidden"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<small>マンジャロ4本 ¥19,800〜</small>",
        "<small hidden>マンジャロ4本 ¥19,800〜</small>"
      );
    }
  },
  {
    name: "top diet ancestor hidden",
    browser: true,
    fragments: ["index.html/ダイエット", "visibility", "visible", "hidden"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        '<div class="menu-grid">',
        '<div class="menu-grid" hidden>'
      );
    }
  },
  {
    name: "top diet inline style hidden",
    browser: true,
    fragments: ["index.html/ダイエット", "visibility", "visible", "hidden"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<small>マンジャロ4本 ¥19,800〜</small>",
        '<small style="display: none">マンジャロ4本 ¥19,800〜</small>'
      );
    }
  },
  {
    name: "top diet opacity hidden",
    browser: true,
    fragments: ["index.html/ダイエット", "visibility", "visible", "hidden"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<small>マンジャロ4本 ¥19,800〜</small>",
        '<small style="opacity:0">マンジャロ4本 ¥19,800〜</small>'
      );
    }
  },
  {
    name: "top diet opacity zero decimal hidden",
    browser: true,
    fragments: ["index.html/ダイエット", "visibility", "visible", "hidden"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "index.html"),
        "<small>マンジャロ4本 ¥19,800〜</small>",
        '<small style="opacity:0.0">マンジャロ4本 ¥19,800〜</small>'
      );
    }
  },
  {
    name: "missing period diagnosis includes dose",
    fragments: ["limited-info/index.html/マンジャロ/2.5mg", "period tokens", "expected=[\"/月\"]", "actual=[]"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "¥19,800/月",
        "¥19,800"
      );
    }
  },
  {
    name: "limited Boglibose extra quantity",
    fragments: ["limited-info/ボグリボース", "mapped row", "60錠", "999錠"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "<td>ボグリボース</td><td>0.3mg</td><td>60錠</td><td>¥3,300</td>",
        "<td>ボグリボース</td><td>0.3mg</td><td>60錠</td><td>999錠</td><td>¥3,300</td>"
      );
    }
  },
  {
    name: "limited Boglibose quantity missing",
    fragments: ["limited-info/ボグリボース", "mapped row", "60錠"],
    mutate: (directory) => {
      replaceOnce(
        path.join(directory, "limited-info/index.html"),
        "<td>ボグリボース</td><td>0.3mg</td><td>60錠</td><td>¥3,300</td>",
        "<td>ボグリボース</td><td>0.3mg</td><td>¥3,300</td>"
      );
    }
  }
];

const staticCases = cases.filter((testCase) => !testCase.browser);
for (const testCase of staticCases) {
  const directory = copyRepository();
  try {
    makeCompliantFixture(directory);
    testCase.mutate(directory);
    const result = runAudit(directory);
    assertFragments(testCase.name, result, testCase.fragments);
    console.log("Fixture passed: " + testCase.name);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

console.log(
  "All static audit fixtures passed: " + staticCases.length +
  " injected failure scenarios detected; " + (cases.length - staticCases.length) +
  " visibility scenarios moved to browser fixtures."
);
