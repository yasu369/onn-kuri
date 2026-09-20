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
const expectedTableCounts = new Map([
  ["index.html", 0],
  ["pricing/index.html", 11],
  ["diet/index.html", 6],
  ["stomach/index.html", 1],
  ["pill/index.html", 1],
  ["ed/index.html", 1],
  ["aga/index.html", 1],
  ["beauty/index.html", 1],
  ["limited-info/index.html", 7]
]);
const errors = [];
const warnings = [];
const tableCache = new Map();
let footerLabels;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeCell(value) {
  return stripTags(value).replace(/[ \t\r\n]+/g, " ").trim();
}

function normalizeDisplayNumbers(value) {
  return value
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0)))
    .replace(/，/g, ",")
    .replace(/￥/g, "¥");
}

function parseTables(relativePath) {
  if (tableCache.has(relativePath)) return tableCache.get(relativePath);
  const html = read(relativePath);
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((tableMatch, tableIndex) => {
    const tableLabel = relativePath + "/table " + (tableIndex + 1);
    const tableHtml = tableMatch[1];
    const captions = [...tableHtml.matchAll(/<caption\b[^>]*>([\s\S]*?)<\/caption>/gi)];
    if (captions.length > 1) {
      addMismatch(tableLabel, "caption count", 1, captions.length);
    }
    for (const caption of captions) {
      const captionText = stripTags(caption[1]);
      if (priceDisplayTokens(captionText).length > 0) {
        addMismatch(tableLabel, "unparsed table content", "price only in table cells", captionText);
      }
    }

    const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const rowsWithoutMarkup = tableHtml
      .replace(/<caption\b[^>]*>[\s\S]*?<\/caption>/gi, "")
      .replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, "");
    const tableOutsideRows = priceDisplayTokens(stripTags(rowsWithoutMarkup));
    if (tableOutsideRows.length > 0) {
      addMismatch(tableLabel, "unparsed table content", "price only in table rows", tableOutsideRows);
    }

    return rows.map((rowMatch, rowIndex) => {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
        .map((cellMatch) => normalizeCell(cellMatch[1]));
      const rowWithoutCells = rowHtml.replace(/<(?:th|td)\b[^>]*>[\s\S]*?<\/(?:th|td)>/gi, "");
      const rowOutsideCells = priceDisplayTokens(stripTags(rowWithoutCells));
      if (cells.length === 0 && priceDisplayTokens(stripTags(rowHtml)).length > 0) {
        addMismatch(
          tableLabel + "/row " + (rowIndex + 1),
          "unparsed table row",
          "price in table cells",
          stripTags(rowHtml)
        );
      } else if (rowOutsideCells.length > 0) {
        addMismatch(
          tableLabel + "/row " + (rowIndex + 1),
          "unparsed row content",
          "price in table cells",
          rowOutsideCells
        );
      }
      return cells;
    }).filter((row) => row.length > 0);
  });
  tableCache.set(relativePath, tables);
  return tables;
}

function getTable(relativePath, index, label) {
  const table = parseTables(relativePath)[index];
  if (!table) {
    errors.push(label + ": table " + (index + 1) + " not found in " + relativePath);
    return null;
  }
  return table;
}

function addMismatch(label, field, expected, actual) {
  errors.push(
    label + ": " + field + " mismatch; expected=" + JSON.stringify(expected) + "; actual=" + JSON.stringify(actual)
  );
}

function addWarning(message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function rowCounts(rows, normalizeRow) {
  const counts = new Map();
  const normalizer = normalizeRow || ((row) => row);
  for (const row of rows) {
    const normalized = normalizer(row);
    const key = JSON.stringify(normalized);
    const entry = counts.get(key) || { count: 0, row: normalized };
    entry.count += 1;
    counts.set(key, entry);
  }
  return counts;
}

function compareRows(expectedRows, actualRows, label, normalizeRow) {
  const expected = rowCounts(expectedRows, normalizeRow);
  const actual = rowCounts(actualRows, normalizeRow);
  const expectedOptions = [...expected.values()].map((entry) => entry.row);

  for (const [key, expectedEntry] of expected) {
    const actualCount = actual.get(key)?.count || 0;
    if (actualCount < expectedEntry.count) {
      for (let index = actualCount; index < expectedEntry.count; index += 1) {
        addMismatch(label, "missing row", expectedEntry.row, "<missing>");
      }
    }
  }

  for (const [key, actualEntry] of actual) {
    const expectedCount = expected.get(key)?.count || 0;
    if (actualEntry.count > expectedCount) {
      for (let index = expectedCount; index < actualEntry.count; index += 1) {
        addMismatch(label, "unexpected row", expectedOptions, actualEntry.row);
      }
    }
  }
}

function compareExactTables({ sourcePath, sourceIndex, targetPath, targetIndex, label }) {
  const source = getTable(sourcePath, sourceIndex, label);
  const target = getTable(targetPath, targetIndex, label);
  if (!source || !target) return;

  if (!sameArray(source[0] || [], target[0] || [])) {
    addMismatch(label, "table headers", source[0] || [], target[0] || []);
  }
  compareRows(source.slice(1), target.slice(1), label);
}

function priceTokens(value) {
  return [...normalizeDisplayNumbers(value).matchAll(/¥\s*[\d,]+/g)]
    .map((match) => match[0].replace(/\s+/g, ""));
}

function periodTokens(value) {
  return [...value.matchAll(/\/月|(?:\d+ヶ月(?:分)?)/g)].map((match) => match[0]);
}

function parseMounjaroRow(row, header) {
  const text = row.join(" ");
  const doseMatch = text.match(/(?<![\d.])(12\.5|7\.5|2\.5|15|10|5)mg(?![\d.])/);
  const prices = priceTokens(text);
  const periods = periodTokens(text);
  const rowQuantityMatch = text.match(/(?<![\d.])(\d+)本(?![\d.])/);
  const headerQuantityMatch = header.join(" ").match(/(?<![\d.])(\d+)本(?![\d.])/);
  const rowQuantity = rowQuantityMatch ? rowQuantityMatch[1] + "本" : null;
  const headerQuantity = headerQuantityMatch ? headerQuantityMatch[1] + "本" : null;
  return {
    row,
    dose: doseMatch ? doseMatch[1] + "mg" : null,
    prices,
    price: prices.length === 1 ? prices[0] : null,
    periods,
    period: periods.length === 1 ? periods[0] : null,
    rowQuantity,
    quantity: rowQuantity || headerQuantity
  };
}

function compareMounjaro() {
  const source = getTable("pricing/index.html", 0, "limited-info/マンジャロ");
  const target = getTable("limited-info/index.html", 0, "limited-info/マンジャロ");
  if (!source || !target) return;

  const expectedHeader = ["用量", "料金（4本）"];
  if (!sameArray(target[0] || [], expectedHeader)) {
    addMismatch("limited-info/マンジャロ", "table headers", expectedHeader, target[0] || []);
  }

  const sourceRows = source.slice(1);
  const targetRows = target.slice(1);
  const sourceByDose = new Map();
  const targetByDose = new Map();
  const invalidTargetDoses = new Set();

  for (const row of sourceRows) {
    const parsed = parseMounjaroRow(row, source[0] || []);
    const rowLabel = parsed.dose ? "pricing/index.html/マンジャロ/" + parsed.dose : "pricing/index.html/マンジャロ";
    if (!parsed.dose) {
      addMismatch(rowLabel, "unparsed row strength", "one mapped dose", row);
    }
    if (parsed.prices.length !== 1) {
      addMismatch(rowLabel, "price tokens", ["one price token"], parsed.prices);
    }
    if (parsed.periods.length !== 1) {
      addMismatch(rowLabel, "period tokens", ["/月"], parsed.periods);
    }
    if (!parsed.dose || parsed.prices.length !== 1 || parsed.periods.length !== 1) {
      continue;
    }
    if (parsed.quantity !== "4本") {
      addMismatch("pricing/index.html/マンジャロ", "quantity", "4本", parsed.quantity);
    }
    if (sourceByDose.has(parsed.dose)) {
      addMismatch("pricing/index.html/マンジャロ", "duplicate dose row", parsed.dose, row);
    }
    sourceByDose.set(parsed.dose, parsed);
  }

  for (const row of targetRows) {
    const parsed = parseMounjaroRow(row, target[0] || []);
    const rowLabel = parsed.dose ? "limited-info/index.html/マンジャロ/" + parsed.dose : "limited-info/index.html/マンジャロ";
    if (!parsed.dose) {
      addMismatch(rowLabel, "unparsed row strength", "one mapped dose", row);
    }
    if (parsed.prices.length !== 1) {
      addMismatch(rowLabel, "price tokens", ["one price token"], parsed.prices);
    }
    if (parsed.periods.length !== 1) {
      addMismatch(rowLabel, "period tokens", ["/月"], parsed.periods);
    }
    if (row.length !== 2) {
      addMismatch(rowLabel, "row shape", ["用量", "料金（4本）"], row);
    }
    if (!parsed.dose || parsed.prices.length !== 1 || parsed.periods.length !== 1 || row.length !== 2) {
      if (parsed.dose) invalidTargetDoses.add(parsed.dose);
      continue;
    }
    if (parsed.rowQuantity && parsed.rowQuantity !== "4本") {
      addMismatch("limited-info/マンジャロ", "row quantity", "4本", parsed.rowQuantity);
    }
    if (targetByDose.has(parsed.dose)) {
      addMismatch("limited-info/マンジャロ", "duplicate dose row", parsed.dose, row);
    }
    targetByDose.set(parsed.dose, parsed);
  }

  for (const [dose, expected] of sourceByDose) {
    const actual = targetByDose.get(dose);
    if (!actual) {
      if (!invalidTargetDoses.has(dose)) {
        addMismatch("limited-info/マンジャロ", "missing dose row", dose, "<missing>");
      }
      continue;
    }
    if (expected.price !== actual.price) {
      addMismatch("limited-info/index.html/マンジャロ/" + dose, "price", expected.price, actual.price);
    }
    if (expected.period !== actual.period) {
      addMismatch("limited-info/index.html/マンジャロ/" + dose, "period", expected.period, actual.period);
    }
    const expectedDisplay = [dose, expected.price + expected.period];
    if (!sameArray(actual.row, expectedDisplay)) {
      addMismatch("limited-info/index.html/マンジャロ/" + dose, "row display", expectedDisplay, actual.row);
    }
    if (actual.quantity !== "4本") {
      addMismatch("limited-info/index.html/マンジャロ/" + dose, "quantity", "4本", actual.quantity);
    }
  }

  for (const [dose, actual] of targetByDose) {
    if (!sourceByDose.has(dose)) {
      addMismatch("limited-info/マンジャロ", "unexpected dose row", "<mapped dose>", actual);
    }
  }
}

function normalizeSgltCell(value, index) {
  if (index === 0) return value.replace(/（\d+\/1錠）$/, "");
  return value.replace(/（\d+）$/, "");
}

function normalizeSgltRow(row) {
  return row.map((cell, index) => normalizeSgltCell(cell, index));
}

function compareLimitedSglt() {
  const source = getTable("pricing/index.html", 4, "limited-info/SGLT2");
  const target = getTable("limited-info/index.html", 3, "limited-info/SGLT2");
  if (!source || !target) return;

  if (!sameArray(source[0] || [], target[0] || [])) {
    addMismatch("limited-info/SGLT2", "table headers", source[0] || [], target[0] || []);
  }
  const expectedRows = source.slice(1).map(normalizeSgltRow);
  compareRows(expectedRows, target.slice(1), "limited-info/SGLT2");
}

function parseSourceDietRow(row) {
  const match = row[0]?.match(/^(.+?)\s+(\d+(?:\.\d+)?mg)$/);
  return {
    name: match ? match[1] : row[0],
    dose: match ? match[2] : null,
    quantity: row[1],
    price: row[2]
  };
}

function compareLimitedOtherDiet() {
  const source = getTable("pricing/index.html", 5, "limited-info/その他ダイエット");
  const target = getTable("limited-info/index.html", 4, "limited-info/その他ダイエット");
  if (!source || !target) return;

  const expectedHeader = ["お薬名称", "規格", "数量", "料金"];
  if (!sameArray(target[0] || [], expectedHeader)) {
    addMismatch("limited-info/その他ダイエット", "table headers", expectedHeader, target[0] || []);
  }

  const sourceRows = source.slice(1).map(parseSourceDietRow);
  const sourceByName = new Map(sourceRows.map((row) => [row.name, row]));
  const requiredNames = ["ボグリボース", "アカルボース", "エゼチミブ"];
  const targetRows = target.slice(1);
  const foundNames = new Set();
  let metforminFound = false;

  for (const row of targetRows) {
    const name = row[0];
    if (name === "メトホルミン") {
      const expected = ["メトホルミン", "500mg", "¥4,980 / ¥14,940 / ¥29,880"];
      if (metforminFound) {
        addMismatch("limited-info/メトホルミン", "duplicate exception row", "one row", row);
      }
      metforminFound = true;
      if (!sameArray(row, expected)) {
        addMismatch("limited-info/メトホルミン", "unresolved exception row", expected, row);
      }
      continue;
    }

    const sourceRow = sourceByName.get(name);
    if (!sourceRow || !requiredNames.includes(name)) {
      addMismatch("limited-info/その他ダイエット", "unexpected row", requiredNames, row);
      continue;
    }
    if (foundNames.has(name)) {
      addMismatch("limited-info/その他ダイエット", "duplicate mapped row", name, row);
    }
    foundNames.add(name);
    const expected = [name, sourceRow.dose, sourceRow.quantity, sourceRow.price];
    if (!sameArray(row, expected)) {
      addMismatch("limited-info/" + name, "mapped row", expected, row);
    }
  }

  for (const name of requiredNames) {
    if (!foundNames.has(name)) {
      addMismatch("limited-info/その他ダイエット", "missing mapped row", name, "<missing>");
    }
  }

  if (!targetRows.some((row) => row[0] === "メトホルミン")) {
    addMismatch(
      "limited-info/メトホルミン",
      "unresolved exception row",
      ["メトホルミン", "500mg", "¥4,980 / ¥14,940 / ¥29,880"],
      "<missing>"
    );
  }
  addWarning(
    "limited-info/index.html のメトホルミン500mgは数量・期間が未確定のため、4,980円／14,940円／29,880円の行を例外として保持しています。"
  );
}

function compareLimitedKampo() {
  const source = getTable("pricing/index.html", 6, "limited-info/漢方");
  const target = getTable("limited-info/index.html", 5, "limited-info/漢方");
  if (!source || !target) return;

  const sourceRow = source.slice(1).find((row) => row[0]?.startsWith("防風通聖散ツムラ"));
  const expected = sourceRow
    ? ["防風通聖散ツムラ・" + sourceRow[1], sourceRow[2]]
    : ["防風通聖散ツムラ・42包", "¥4,380"];

  if (target.length !== 1) {
    addMismatch("limited-info/漢方", "row count", 1, target.length);
  }
  const actual = target[0] || [];
  if (!sameArray(actual, expected)) {
    addMismatch("limited-info/漢方", "mapped row", expected, actual);
  }
}

function compareLimitedPill() {
  const source = getTable("pricing/index.html", 7, "limited-info/低用量ピル");
  const target = getTable("limited-info/index.html", 6, "limited-info/低用量ピル");
  if (!source || !target) return;

  const sourceRows = source.slice(1);
  if (sourceRows.some((row) => !row.some((cell) => cell === "入荷待ち"))) {
    addMismatch("pricing/index.html/低用量ピル", "stock status", "all plans are 入荷待ち", sourceRows);
  }

  const expected = ["トリキュラー28", "入荷待ち（1か月分）"];
  if (target.length !== 1) {
    addMismatch("limited-info/低用量ピル", "row count", 1, target.length);
  }
  const actual = target[0] || [];
  if (!sameArray(actual, expected)) {
    addMismatch("limited-info/低用量ピル", "mapped row", expected, actual);
  }
}

function elementPattern(tag, className, flags) {
  const escapedClass = className.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  return new RegExp(
    "<" + tag + "\\b[^>]*class=\"[^\"]*\\b" + escapedClass + "\\b[^\"]*\"[^>]*>[\\s\\S]*?<\\/" + tag + ">",
    flags || "i"
  );
}

function elementByClass(html, tag, className) {
  return html.match(elementPattern(tag, className))?.[0] || "";
}

function elementsByClass(html, tag, className) {
  return [...html.matchAll(elementPattern(tag, className, "gi"))];
}

function removeElementsByClass(html, tag, className) {
  return html.replace(elementPattern(tag, className, "gi"), "");
}

function removeAnchorsByHref(html, href) {
  const escapedHref = href.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  return html.replace(
    new RegExp("<a\\b[^>]*href=\"" + escapedHref + "\"[^>]*>[\\s\\S]*?<\\/a>", "gi"),
    ""
  );
}

function removeTables(html) {
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, "");
}

function priceDisplayTokens(value) {
  const normalized = normalizeDisplayNumbers(value);
  return [...normalized.matchAll(/¥\s*[\d,]+|[\d,]+円(?:以上|以下)?/g)].map((match) =>
    match[0].replace(/\s+/g, "")
  );
}

function checkTableInventory() {
  for (const [relativePath, expectedCount] of expectedTableCounts) {
    const actualCount = parseTables(relativePath).length;
    if (actualCount !== expectedCount) {
      addMismatch(relativePath, "table count", expectedCount, actualCount);
    }
  }
}

function checkTopSummaries() {
  const html = read("index.html");
  const pricing = getTable("pricing/index.html", 0, "index.html/マンジャロ基準");
  const mounjaroPlans = pricing
    ? pricing
      .slice(1)
      .map((row) => parseMounjaroRow(row, pricing[0] || []))
      .filter((row) => row.price && row.quantity === "4本")
    : [];
  const minimumMounjaro = mounjaroPlans.reduce((minimum, row) => {
    if (!minimum) return row;
    const minimumAmount = Number(minimum.price.replace(/[¥,]/g, ""));
    const rowAmount = Number(row.price.replace(/[¥,]/g, ""));
    return rowAmount < minimumAmount ? row : minimum;
  }, null);
  const expectedMounjaro = minimumMounjaro?.price && minimumMounjaro?.quantity
    ? "ダイエットマンジャロ" + minimumMounjaro.quantity + " " + minimumMounjaro.price + "〜"
    : "ダイエットマンジャロ4本 ¥19,800〜";
  const dietAnchors = [...html.matchAll(/<a\b[^>]*href="diet\/"[^>]*>([\s\S]*?)<\/a>/gi)];
  const pillAnchors = [...html.matchAll(/<a\b[^>]*href="pill\/"[^>]*>([\s\S]*?)<\/a>/gi)];

  if (dietAnchors.length !== 1) {
    addMismatch("index.html/ダイエット", "summary link count", 1, dietAnchors.length);
  } else {
    const actual = stripTags(dietAnchors[0][0]);
    if (actual !== expectedMounjaro) {
      addMismatch("index.html/ダイエット", "scoped summary", expectedMounjaro, actual);
    }
    const expectedPrice = minimumMounjaro?.price || "¥19,800";
    const actualPrices = priceDisplayTokens(actual);
    if (!sameArray(actualPrices, [expectedPrice])) {
      addMismatch("index.html/ダイエット", "summary price tokens", [expectedPrice], actualPrices);
    }
  }

  if (pillAnchors.length !== 1) {
    addMismatch("index.html/低用量ピル", "summary link count", 1, pillAnchors.length);
  } else {
    const actual = stripTags(pillAnchors[0][0]);
    if (actual !== "低用量ピル現在入荷待ち") {
      addMismatch("index.html/低用量ピル", "scoped summary", "低用量ピル現在入荷待ち", actual);
    }
  }

  const noticeBlocks = elementsByClass(html, "section", "notice-band");
  if (noticeBlocks.length !== 1) {
    addMismatch("index.html/料金案内", "notice-band block count", 1, noticeBlocks.length);
  }
  const notice = noticeBlocks[0]?.[0] || "";
  const expectedNotice =
    "通院不要で自宅で完結。診察料はかからず、お薬代のみ。※お薬代4,201円以上は送料無料。4,200円以下は送料550円";
  if (stripTags(notice) !== expectedNotice) {
    addMismatch("index.html/料金案内", "notice block", expectedNotice, stripTags(notice) || "<missing>");
  }
  const expectedNoticePrices = ["4,201円以上", "4,200円以下", "550円"];
  const actualNoticePrices = priceDisplayTokens(stripTags(notice));
  if (!sameArray(actualNoticePrices, expectedNoticePrices)) {
    addMismatch("index.html/料金案内", "notice price tokens", expectedNoticePrices, actualNoticePrices);
  }

  const benefitBlocks = elementsByClass(html, "section", "benefit-strip");
  if (benefitBlocks.length !== 1) {
    addMismatch("index.html/料金案内", "benefit-strip block count", 1, benefitBlocks.length);
  }
  const benefits = benefitBlocks[0]?.[0] || "";
  const expectedBenefits =
    "01 診察料0円 初診・再診ともに診察料はかかりません。費用はお薬代が中心です。 " +
    "02 4,201円以上は送料無料 お薬代の合計が4,201円以上の場合、送料はかかりません。 " +
    "03 定期購入の必要なし 必要なタイミングに、必要な分だけ都度購入できます。";
  if (stripTags(benefits) !== expectedBenefits) {
    addMismatch("index.html/料金案内", "benefit block", expectedBenefits, stripTags(benefits) || "<missing>");
  }
  const expectedBenefitPrices = ["0円", "4,201円以上", "4,201円以上"];
  const actualBenefitPrices = priceDisplayTokens(stripTags(benefits));
  if (!sameArray(actualBenefitPrices, expectedBenefitPrices)) {
    addMismatch("index.html/料金案内", "benefit price tokens", expectedBenefitPrices, actualBenefitPrices);
  }

  const ctaBlocks = elementsByClass(html, "section", "cta-section");
  if (ctaBlocks.length !== 1) {
    addMismatch("index.html/料金案内", "cta-section block count", 1, ctaBlocks.length);
  }
  for (const cta of ctaBlocks) {
    const ctaText = stripTags(cta[0]);
    if (!ctaText.includes("通院不要・診察料0円")) {
      addMismatch("index.html/料金案内", "reservation fee display", "通院不要・診察料0円", ctaText || "<missing>");
    }
    const actualCtaPrices = priceDisplayTokens(ctaText);
    if (!sameArray(actualCtaPrices, ["0円"])) {
      addMismatch("index.html/料金案内", "reservation fee amounts", ["0円"], actualCtaPrices);
    }
  }
}

function checkOutsideTablePrices() {
  for (const [relativePath] of expectedTableCounts) {
    let remaining = removeTables(read(relativePath));
    if (relativePath === "index.html") {
      remaining = removeElementsByClass(remaining, "section", "notice-band");
      remaining = removeElementsByClass(remaining, "section", "benefit-strip");
      remaining = removeElementsByClass(remaining, "section", "cta-section");
      remaining = removeAnchorsByHref(remaining, "diet/");
      remaining = removeAnchorsByHref(remaining, "pill/");
    }
    const tokens = priceDisplayTokens(stripTags(remaining));
    if (tokens.length > 0) {
      addMismatch(relativePath, "unmapped outside-table pricing", [], tokens);
    }
  }
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
    if (!pattern.test(html)) errors.push(label + ": missing " + name);
  }

  if (/(?:href|src)="\/(?!\/)/.test(html)) {
    errors.push(label + ": root-relative asset or link found");
  }

  for (const match of html.matchAll(/<a\b[^>]*data-config-reservation[^>]*>/g)) {
    if (!match[0].includes('href="https://lin.ee/PNBQpOa"')) {
      errors.push(label + ": reservation link is not the official LINE URL");
    }
  }

  for (const pattern of ["pochi-clinic", "pochi-clinick", "Pochikuri", "低容量ピル", "予約導線"]) {
    if (html.includes(pattern)) errors.push(label + ": stale text found: " + pattern);
  }

  const footer = html.match(/<div class="footer-links">([\s\S]*?)<\/div>/)?.[1];
  if (!footer) {
    errors.push(label + ": footer links not found");
  } else {
    const labels = [...footer.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((match) => stripTags(match[1]));
    if (!footerLabels) footerLabels = labels;
    if (JSON.stringify(labels) !== JSON.stringify(footerLabels)) {
      errors.push(label + ": footer link labels differ from the shared set");
    }
  }
}

const pricing = read("pricing/index.html");
for (const category of categories) {
  if (!pricing.includes('id="' + category + '"')) errors.push("pricing/: missing #" + category + " anchor");
  const page = read(category + "/index.html");
  if (!page.includes("pricing/#" + category)) errors.push(category + "/: missing pricing anchor link");
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

const exactMappings = [
  ["pricing/index.html", 0, "diet/index.html", 0, "diet/マンジャロ"],
  ["pricing/index.html", 1, "diet/index.html", 1, "diet/オゼンピック"],
  ["pricing/index.html", 2, "diet/index.html", 2, "diet/サクセンダ"],
  ["pricing/index.html", 3, "diet/index.html", 3, "diet/リベルサス"],
  ["pricing/index.html", 4, "diet/index.html", 4, "diet/SGLT2"],
  ["pricing/index.html", 5, "diet/index.html", 5, "diet/その他ダイエット"],
  ["pricing/index.html", 6, "stomach/index.html", 0, "stomach/胃腸"],
  ["pricing/index.html", 7, "pill/index.html", 0, "pill/低用量ピル"],
  ["pricing/index.html", 8, "ed/index.html", 0, "ed/ED"],
  ["pricing/index.html", 9, "aga/index.html", 0, "aga/AGA"],
  ["pricing/index.html", 10, "beauty/index.html", 0, "beauty/美容"]
];
for (const [sourcePath, sourceIndex, targetPath, targetIndex, label] of exactMappings) {
  compareExactTables({ sourcePath, sourceIndex, targetPath, targetIndex, label });
}

compareMounjaro();
compareExactTables({
  sourcePath: "pricing/index.html",
  sourceIndex: 1,
  targetPath: "limited-info/index.html",
  targetIndex: 1,
  label: "limited-info/オゼンピック"
});
compareExactTables({
  sourcePath: "pricing/index.html",
  sourceIndex: 3,
  targetPath: "limited-info/index.html",
  targetIndex: 2,
  label: "limited-info/リベルサス"
});
compareLimitedSglt();
compareLimitedOtherDiet();
compareLimitedKampo();
compareLimitedPill();
checkTableInventory();
checkTopSummaries();
checkOutsideTablePrices();

if (errors.length > 0) {
  console.error("Audit failed with " + errors.length + " issue(s):");
  for (const error of errors) console.error("- " + error);
  if (warnings.length > 0) {
    console.error("Explicit audit exceptions/warnings:");
    for (const warning of warnings) console.error("- " + warning);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Audit passed: " + publicPages.length + " public pages, " + pillRows.length + " pill price rows, " +
    news.length + " note posts, " + exactMappings.length + " exact pricing mappings."
  );
  if (warnings.length > 0) {
    console.warn("Explicit audit exceptions/warnings:");
    for (const warning of warnings) console.warn("- " + warning);
  }
}
