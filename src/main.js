import fs from "node:fs";
import path from "node:path";

const apiKey = (
  process.env.INPUT_API_KEY ||
  process.env.PROVCHART_API_KEY ||
  ""
).trim();

const token = (process.env.INPUT_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const repoInput = (process.env.INPUT_REPO || "").trim();
const outputDir = process.env.INPUT_OUTPUT_DIR || "docs/charts";
const theme = process.env.INPUT_THEME || "midnight";
const chartsList = (process.env.INPUT_CHARTS || "overview,languages")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const overviewType = process.env.INPUT_OVERVIEW_TYPE || "hbar";
const languagesType = process.env.INPUT_LANGUAGES_TYPE || "hbar";
const languageLimit = Math.max(
  1,
  parseInt(process.env.INPUT_LANGUAGE_LIMIT || "8", 10) || 8
);
const apiBase = (
  process.env.INPUT_API_BASE || "https://provchart-api.devtem.org"
).replace(/\/$/, "");
const width = parseInt(process.env.INPUT_WIDTH || "640", 10) || 640;
const heightOverview =
  parseInt(process.env.INPUT_HEIGHT_OVERVIEW || "280", 10) || 280;
const heightLanguages =
  parseInt(process.env.INPUT_HEIGHT_LANGUAGES || "300", 10) || 300;
const normalizeOverview =
  String(process.env.INPUT_NORMALIZE_OVERVIEW || "true").toLowerCase() !==
  "false";

const COLORS = {
  primary: "#8b7bff",
  teal: "#4fd8c4",
};

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  fs.appendFileSync(out, `${name}=${value}\n`);
}

function resolveRepo() {
  if (repoInput) {
    const [owner, name] = repoInput.split("/");
    if (!owner || !name) fail(`Invalid repo "${repoInput}" — use owner/name`);
    return { owner, name };
  }
  const full = process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = full.split("/");
  if (!owner || !name) {
    fail("Cannot resolve repo (set input repo or run inside GitHub Actions)");
  }
  return { owner, name };
}

async function ghJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: token ? `Bearer ${token}` : "",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "provchart-repo-stats",
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  if (!res.ok) {
    fail(
      `GitHub API ${res.status} ${url} — ${data.message || text.slice(0, 200)}`
    );
  }
  return data;
}

/** Map values to \~0–100 so one huge metric does not crush the others */
function normalizePoints(values) {
  const nums = values.map((v) => Math.max(0, Number(v) || 0));
  const max = Math.max(...nums, 1);
  return nums.map((n) => Math.round((n / max) * 1000) / 10);
}

function buildOverviewPayload(repo) {
  const labels = ["Stars", "Forks", "Watchers", "Issues"];
  const raw = [
    repo.stargazers_count ?? 0,
    repo.forks_count ?? 0,
    repo.subscribers_count ?? 0,
    repo.open_issues_count ?? 0,
  ];

  const points = normalizeOverview ? normalizePoints(raw) : raw;

  console.log(
    `Overview raw: stars=${raw[0]} forks=${raw[1]} watchers=${raw[2]} issues=${raw[3]} (normalize=${normalizeOverview})`
  );

  const payload = {
    file: "repo-overview.svg",
    type: overviewType,
    theme,
    width,
    height: heightOverview,
    axisX: labels,
    series: [
      {
        name: "Count",
        color: COLORS.primary,
        points,
      },
    ],
  };

  if (normalizeOverview) {
    payload.min = 0;
    payload.max = 100;
  }

  return payload;
}

function buildLanguagesPayload(langMap) {
  const entries = Object.entries(langMap || {})
    .map(([name, bytes]) => ({ name, bytes: Number(bytes) || 0 }))
    .filter((e) => e.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, languageLimit);

  if (!entries.length) {
    console.log("No language data — skipping languages chart");
    return null;
  }

  const total = entries.reduce((s, e) => s + e.bytes, 0) || 1;
  const axisX = entries.map((e) => e.name);
  const points = entries.map(
    (e) => Math.round((e.bytes / total) * 1000) / 10
  );

  console.log(`Languages: ${axisX.join(", ")}`);

  return {
    file: "languages.svg",
    type: languagesType,
    theme,
    width,
    height: heightLanguages,
    min: 0,
    max: 100,
    axisX,
    series: [
      {
        name: "Share %",
        color: COLORS.teal,
        points,
      },
    ],
  };
}

async function generateSvg(payload) {
  const { file, ...body } = payload;
  const res = await fetch(`${apiBase}/api/v1/generate-svg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }

  if (!res.ok || data.success === false) {
    const detail =
      data.error ||
      data.code ||
      data.message ||
      text.slice(0, 400) ||
      "(empty body)";
    throw new Error(`HTTP ${res.status} — ${detail}`);
  }
  if (!data.svg) {
    throw new Error(`No svg in response: ${text.slice(0, 300)}`);
  }
  return data.svg;
}

async function main() {
  if (!apiKey) fail("Missing api-key / PROVCHART_API_KEY");

  const { owner, name } = resolveRepo();
  console.log(`Repo: ${owner}/${name}`);

  const repo = await ghJson(`https://api.github.com/repos/${owner}/${name}`);
  const languages = await ghJson(
    `https://api.github.com/repos/${owner}/${name}/languages`
  );

  const jobs = [];
  if (chartsList.includes("overview")) {
    jobs.push(buildOverviewPayload(repo));
  }
  if (chartsList.includes("languages")) {
    const langPayload = buildLanguagesPayload(languages);
    if (langPayload) jobs.push(langPayload);
  }

  if (!jobs.length) fail("No charts to generate (check charts input)");

  fs.mkdirSync(outputDir, { recursive: true });
  const written = [];

  for (const payload of jobs) {
    const outPath = path.join(outputDir, payload.file);
    console.log(`Generating ${outPath} (${payload.type})…`);
    try {
      const svg = await generateSvg(payload);
      fs.writeFileSync(outPath, svg, "utf8");
      written.push(outPath);
      console.log(`Wrote ${outPath}`);
    } catch (err) {
      fail(`${outPath}: ${err.message}`);
    }
  }

  setOutput("files", written.join(","));
  console.log(`Done. ${written.length} file(s).`);
}

main().catch((err) => fail(err.message || String(err)));
