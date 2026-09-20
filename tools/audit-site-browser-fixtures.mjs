import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditRoot } from "./audit-site-browser.mjs";

const repositoryRoot = process.cwd();

function copyRepository() {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "onn-kuri-browser-audit-"));
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

function assertBrowserResult(name, result, expectedPass, fragments = []) {
  const output = result.errors.join("\n");
  const requiredViewports = ["desktop", "mobile"];
  if (expectedPass && result.status !== 0) {
    throw new Error(name + " failed unexpectedly.\n" + output);
  }
  if (expectedPass) {
    const measuredViewports = new Set(result.measurements.map((measurement) => measurement.viewport));
    const missingViewports = requiredViewports.filter((viewport) => !measuredViewports.has(viewport));
    if (missingViewports.length > 0) {
      throw new Error(name + " did not verify every viewport: " + missingViewports.join(", "));
    }
    return;
  }
  if (!expectedPass) {
    const missingViewports = requiredViewports.filter((viewport) => !result.errors.some((error) =>
      error.includes("viewport=" + viewport) && fragments.every((fragment) => error.includes(fragment))
    ));
    if (result.status === 0 || missingViewports.length > 0) {
      throw new Error(
        name + " did not produce the expected browser diagnostic for every viewport " +
        JSON.stringify(fragments) + ". Missing: " + missingViewports.join(", ") + "\n" + output
      );
    }
  }
}

const dietMarker = "<small>マンジャロ4本 ¥19,800〜</small>";
const pillMarker = "<small>現在入荷待ち</small>";

const cases = [
  {
    name: "browser normal summary",
    expectedPass: true,
    mutate: () => {}
  },
  {
    name: "browser unrelated hidden sibling",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<span hidden></span>' + dietMarker
    )
  },
  {
    name: "browser visible split summary",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      "<small><span>マンジャロ4本 </span><span>¥19,800〜</span></small>"
    )
  },
  {
    name: "browser fully split visible summary",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      "<small><span>マン</span><span>ジャロ</span><span>4</span><span>本 </span><span>¥19,800</span><span>〜</span></small>"
    )
  },
  {
    name: "browser visibility child override",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden"><span style="visibility:visible">マンジャロ4本 ¥19,800〜</span></small>'
    )
  },
  {
    name: "top quantity hidden while price visible",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "4本", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small><span hidden>マンジャロ4本 </span><span>¥19,800〜</span></small>'
    )
  },
  {
    name: "top diet price hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      "<small hidden>マンジャロ4本 ¥19,800〜</small>"
    )
  },
  {
    name: "top diet ancestor hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      '<div class="menu-grid">',
      '<div class="menu-grid" hidden>'
    )
  },
  {
    name: "top diet inline style hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "top diet opacity hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "top diet opacity zero decimal hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0.0">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity 0.5 visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0.5">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity 1 visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:1">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser data attribute is not CSS",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small data-note="style=\'opacity:0\';display:none">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity important zero hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "マンジャロ", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity last zero hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:1;opacity:0">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity last one visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0;opacity:1">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity important hidden wins",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0!important;opacity:1">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity important visible wins",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0;opacity:1!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity equal important later visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0!important;opacity:1!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity equal important later hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:1!important;opacity:0!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser opacity invalid later keeps zero",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="opacity:0;opacity:invalid">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser data attribute cannot override real style",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small data-note="style=\'opacity:1\'" style="opacity:0">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display important none hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none!important;display:block">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display important block visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none;display:block!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display equal important later visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none!important;display:block!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display equal important later hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:block!important;display:none!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display last none hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:block;display:none">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display last block visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none;display:block">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser display invalid later keeps none",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="display:none;display:invalid">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility important hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden!important;visibility:visible">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility important visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden;visibility:visible!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility equal important later visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden!important;visibility:visible!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility equal important later hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:visible!important;visibility:hidden!important">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility last hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:visible;visibility:hidden">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility last visible",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden;visibility:visible">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser visibility invalid later keeps hidden",
    expectedPass: false,
    fragments: ["index.html/ダイエット", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      dietMarker,
      '<small style="visibility:hidden;visibility:invalid">マンジャロ4本 ¥19,800〜</small>'
    )
  },
  {
    name: "browser pill hidden sibling",
    expectedPass: true,
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      pillMarker,
      '<span hidden></span>' + pillMarker
    )
  },
  {
    name: "browser pill status hidden",
    expectedPass: false,
    fragments: ["index.html/低用量ピル", "visibility mismatch", "現在入荷待ち", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      pillMarker,
      "<small hidden>現在入荷待ち</small>"
    )
  },
  {
    name: "browser pill ancestor hidden",
    expectedPass: false,
    fragments: ["index.html/低用量ピル", "visibility mismatch", "hidden"],
    mutate: (directory) => replaceOnce(
      path.join(directory, "index.html"),
      '<div class="menu-grid">',
      '<div class="menu-grid" hidden>'
    )
  }
];

for (const testCase of cases) {
  const directory = copyRepository();
  try {
    testCase.mutate(directory);
    const result = await auditRoot(directory);
    assertBrowserResult(testCase.name, result, testCase.expectedPass, testCase.fragments);
    console.log("Browser fixture passed: " + testCase.name);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

console.log("All browser audit fixtures passed: " + cases.length + " scenarios detected or accepted.");
