const REPO = "cdq3000/junyan-newmedia-dashboard";
const DATA_PATH = "data/dashboard-data.json";
const SOURCE_EXCEL_PATH = "data/source.xlsx";
const REMOTE_DATA_URL = `https://raw.githubusercontent.com/${REPO}/main/${DATA_PATH}`;
const LOCAL_DATA_URL = "./data/dashboard-data.json";
const ACCESS_CODE = "JUNYAN-2026";
const ZERO_METRICS = {
  liveSessions: 0,
  shortVideos: 0,
  leads: 0,
  visits: 0,
  orders: 0,
  orderShare: 0,
  attritionRate: 0,
  spend: 0,
};

const NAME_ALIASES = {
  花都建设北零跑: "花都零跑",
  清远港鸿: "清远港鸿零跑",
  清远奇晟: "清远奇晟零跑",
  清远英德: "清远英德零跑",
  广花店: "广花零跑",
  北站店: "北站零跑",
  花都北站零跑: "北站零跑",
};

const STORE_ORDER = [
  "花都广本",
  "清远广本",
  "汕头广本",
  "鑫海广本",
  "花都零跑",
  "白云零跑",
  "清远港鸿零跑",
  "清远奇晟零跑",
  "清远英德零跑",
  "河源零跑",
  "汕头零跑",
  "广花零跑",
  "北站零跑",
  "清远极氪",
  "清远智己",
  "江门大众",
  "花都传祺",
  "从化零跑",
];

let state = {
  unlocked: false,
  dirty: false,
  data: null,
  month: null,
  store: null,
  workbookPreview: null,
  previewSheet: null,
  excelUpload: null,
};

const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function metricLabel(key) {
  return state.data?.metrics?.[key] || key;
}

function rate(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function activeStore() {
  return state.data.stores.find((store) => store.name === state.store);
}

function normalizeMonthName(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return `${Number(raw)}月`;
  return raw.endsWith("月") ? raw : `${raw}月`;
}

function normalizeStoreName(value) {
  const name = String(value || "").trim();
  if (!name) return null;
  return NAME_ALIASES[name] || name;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.startsWith("#")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureMonth(store, month) {
  store.monthly ||= {};
  store.monthly[month] ||= clone(ZERO_METRICS);
}

function ensurePayloadStore(payload, name) {
  let store = payload.stores.find((item) => item.name === name);
  if (!store) {
    store = {
      name,
      monthly: Object.fromEntries(payload.months.map((month) => [month, clone(ZERO_METRICS)])),
    };
    payload.stores.push(store);
  }
  payload.months.forEach((month) => ensureMonth(store, month));
  return store;
}

function recalcTotals() {
  const data = state.data;
  data.months.forEach((month) => {
    const total = clone(ZERO_METRICS);
    let orderWeight = 0;
    let weightedShare = 0;
    data.stores.forEach((store) => {
      ensureMonth(store, month);
      const values = store.monthly[month];
      Object.keys(total).forEach((key) => {
        if (key !== "orderShare") total[key] += Number(values[key] || 0);
      });
      const orders = Number(values.orders || 0);
      const share = Number(values.orderShare || 0);
      orderWeight += orders;
      weightedShare += orders * share;
    });
    total.orderShare = orderWeight ? weightedShare / orderWeight : 0;
    data.totals[month] = total;
  });
  data.latestMonth = data.months.at(-1) || null;
  data.previousMonth = data.months.length > 1 ? data.months.at(-2) : null;
  data.generatedAt = new Date().toISOString().slice(0, 19);
}

function setDirty(value = true) {
  state.dirty = value;
  document.querySelector("#dirtyBadge").textContent = value ? "有未发布修改" : "未修改";
}

function setStatus(message) {
  document.querySelector("#statusSync").textContent = message;
}

function renderStatus() {
  document.querySelector("#statusMonth").textContent = state.month || "-";
  document.querySelector("#statusStores").textContent = state.data?.stores?.length || "-";
  document.querySelector("#statusSync").textContent = state.data?.generatedAt?.replace("T", " ") || "-";
}

function renderMonths() {
  const select = document.querySelector("#monthSelect");
  select.innerHTML = state.data.months.map((month) => `<option value="${month}">${month}</option>`).join("");
  select.value = state.month;
}

function renderStores() {
  const list = document.querySelector("#storeList");
  const query = document.querySelector("#storeSearch").value.trim().toLowerCase();
  const stores = state.data.stores.filter((store) => !query || store.name.toLowerCase().includes(query));
  list.innerHTML = stores.map((store) => `
    <button class="store-item ${store.name === state.store ? "active" : ""}" data-store="${store.name}" type="button">
      <span>${store.name}</span>
      <small>${fmt.format(store.monthly?.[state.month]?.orders || 0)} 单</small>
    </button>
  `).join("");
  list.querySelectorAll(".store-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.store = button.dataset.store;
      renderAll();
    });
  });
}

function renderMetricForm() {
  const store = activeStore();
  if (!store) return;
  ensureMonth(store, state.month);
  document.querySelectorAll("[data-metric]").forEach((input) => {
    input.value = store.monthly[state.month][input.dataset.metric] ?? 0;
  });
}

function renderTable() {
  const rows = document.querySelector("#monthRows");
  rows.innerHTML = state.data.stores.map((store) => {
    ensureMonth(store, state.month);
    const m = store.monthly[state.month];
    return `
      <tr>
        <td>${store.name}</td>
        <td>${fmt.format(m.liveSessions || 0)}</td>
        <td>${fmt.format(m.shortVideos || 0)}</td>
        <td>${fmt.format(m.leads || 0)}</td>
        <td>${fmt.format(m.visits || 0)}</td>
        <td>${fmt.format(m.orders || 0)}</td>
        <td>${pct.format(m.orderShare || 0)}</td>
        <td>${pct.format(rate(m.visits || 0, m.leads || 0))}</td>
        <td>${pct.format(rate(m.orders || 0, m.visits || 0))}</td>
        <td>${pct.format(m.attritionRate || 0)}</td>
      </tr>
    `;
  }).join("");
}

function renderAll() {
  renderStatus();
  renderMonths();
  renderStores();
  renderMetricForm();
  renderTable();
  renderExcelPreview();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function workbookToPreview(workbook) {
  const preview = {};
  workbook.SheetNames.forEach((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    if (!range) {
      preview[name] = [];
      return;
    }
    const rows = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const cells = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[address];
        cells.push(cell?.w ?? cell?.v ?? "");
      }
      rows.push(cells);
    }
    preview[name] = rows;
  });
  return preview;
}

function renderExcelPreview() {
  const select = document.querySelector("#sheetSelect");
  const target = document.querySelector("#excelPreview");
  if (!state.workbookPreview) {
    select.innerHTML = "";
    target.className = "excel-preview empty";
    target.textContent = "导入 Excel 后，这里会显示原始工作表。";
    return;
  }
  const sheetNames = Object.keys(state.workbookPreview);
  select.innerHTML = sheetNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  state.previewSheet = state.previewSheet && state.workbookPreview[state.previewSheet] ? state.previewSheet : sheetNames[0];
  select.value = state.previewSheet;
  const rows = state.workbookPreview[state.previewSheet] || [];
  const colCount = Math.max(...rows.map((row) => row.length), 1);
  const headers = Array.from({ length: colCount }, (_, index) => `<th>${index + 1}</th>`).join("");
  const body = rows.map((row, rowIndex) => `
    <tr>
      <td>${rowIndex + 1}</td>
      ${Array.from({ length: colCount }, (_, colIndex) => `<td title="${escapeHtml(row[colIndex])}">${escapeHtml(row[colIndex])}</td>`).join("")}
    </tr>
  `).join("");
  target.className = "excel-preview";
  target.innerHTML = `
    <table>
      <thead><tr><th>#</th>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function fetchJsonData() {
  let response = await fetch(`${REMOTE_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) response = await fetch(`${LOCAL_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`数据读取失败 HTTP ${response.status}`);
  return response.json();
}

async function loadData() {
  const draft = localStorage.getItem("junyanAdminDraft");
  state.data = draft ? JSON.parse(draft) : await fetchJsonData();
  state.month = state.data.latestMonth || state.data.months.at(-1);
  state.store = state.data.stores[0]?.name || null;
  recalcTotals();
  setDirty(Boolean(draft));
  renderAll();
}

function saveCurrentStore() {
  const store = activeStore();
  if (!store) return;
  ensureMonth(store, state.month);
  document.querySelectorAll("[data-metric]").forEach((input) => {
    store.monthly[state.month][input.dataset.metric] = Number(input.value || 0);
  });
  recalcTotals();
  setDirty(true);
  renderAll();
}

function saveDraft() {
  saveCurrentStore();
  localStorage.setItem("junyanAdminDraft", JSON.stringify(state.data));
  setStatus("草稿已保存到当前浏览器");
}

function addStore() {
  const name = prompt("输入新门店名称");
  if (!name?.trim()) return;
  const clean = name.trim();
  if (state.data.stores.some((store) => store.name === clean)) {
    alert("门店已存在");
    return;
  }
  state.data.stores.push({
    name: clean,
    monthly: Object.fromEntries(state.data.months.map((month) => [month, clone(ZERO_METRICS)])),
  });
  state.store = clean;
  recalcTotals();
  setDirty(true);
  renderAll();
}

function renameStore() {
  const store = activeStore();
  if (!store) return;
  const next = prompt("输入新的门店名称", store.name);
  if (!next?.trim()) return;
  const clean = next.trim();
  if (state.data.stores.some((item) => item.name === clean && item !== store)) {
    alert("门店名称已存在");
    return;
  }
  store.name = clean;
  state.store = clean;
  recalcTotals();
  setDirty(true);
  renderAll();
}

function deleteStore() {
  if (!state.store) return;
  if (!confirm(`确认删除 ${state.store}？`)) return;
  state.data.stores = state.data.stores.filter((store) => store.name !== state.store);
  state.store = state.data.stores[0]?.name || null;
  recalcTotals();
  setDirty(true);
  renderAll();
}

function addMonth() {
  const month = normalizeMonthName(prompt("输入新增月份，例如 6 或 6月"));
  if (!month) return;
  if (state.data.months.includes(month)) {
    state.month = month;
    renderAll();
    return;
  }
  state.data.months.push(month);
  state.data.months.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  state.data.stores.forEach((store) => ensureMonth(store, month));
  state.month = month;
  recalcTotals();
  setDirty(true);
  renderAll();
}

function exportJson() {
  recalcTotals();
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dashboard-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function readGitHubError(response) {
  let details = "";
  try {
    const json = await response.json();
    details = json.message || JSON.stringify(json);
  } catch {
    details = await response.text();
  }
  if (response.status === 401) {
    return "GitHub token 无效或已过期，请重新生成 token。";
  }
  if (response.status === 403) {
    return "GitHub token 没有写入权限。请确认 fine-grained token 已授权本仓库，并具备 Contents: Read and write。";
  }
  if (response.status === 404) {
    return "没有找到仓库或数据文件。请确认 token 已授权 cdq3000/junyan-newmedia-dashboard。";
  }
  if (response.status === 409) {
    return "远程数据刚被别人更新过，请先点击“重新读取线上数据”，合并后再发布。";
  }
  return `GitHub 返回 HTTP ${response.status}: ${details}`;
}

async function validateGitHubToken(headers) {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, { headers });
  if (!response.ok) {
    throw new Error(await readGitHubError(response));
  }
  const repo = await response.json();
  if (!repo.permissions?.push) {
    throw new Error("当前 token 可以读取仓库，但没有 push 权限。请给 token 增加 Contents: Read and write。");
  }
}

async function getRemoteDataFile(headers) {
  const getUrl = `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}?ref=main`;
  const current = await fetch(getUrl, { headers });
  if (current.status === 404) {
    return null;
  }
  if (!current.ok) {
    throw new Error(await readGitHubError(current));
  }
  return current.json();
}

async function getRemoteFile(headers, path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=main`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readGitHubError(response));
  return response.json();
}

async function updateRemoteDataFile(headers, token) {
  const info = await getRemoteDataFile(headers);
  const body = {
    message: `Update dashboard data ${state.data.generatedAt}`,
    content: toBase64Utf8(JSON.stringify(state.data, null, 2)),
    branch: "main",
  };
  if (info?.sha) body.sha = info.sha;
  const update = await fetch(`https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!update.ok) {
    throw new Error(await readGitHubError(update));
  }
  return update.json();
}

async function dispatchPagesWorkflow(headers) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/pages.yml/dispatches`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok && response.status !== 204) {
    console.warn("Pages workflow dispatch failed", await readGitHubError(response));
  }
}

async function dispatchDataSyncWorkflow(headers) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/sync-data.yml/dispatches`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(await readGitHubError(response));
  }
}

async function uploadSourceExcel(headers) {
  if (!state.excelUpload) {
    throw new Error("没有待发布的 Excel 文件，请先导入 .xlsx 总表。");
  }
  const info = await getRemoteFile(headers, SOURCE_EXCEL_PATH);
  const body = {
    message: `Upload source Excel ${state.excelUpload.name}`,
    content: state.excelUpload.content,
    branch: "main",
  };
  if (info?.sha) body.sha = info.sha;
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${SOURCE_EXCEL_PATH}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readGitHubError(response));
  }
  return response.json();
}

async function publishToGitHub() {
  saveCurrentStore();
  const token = document.querySelector("#githubToken").value.trim() || sessionStorage.getItem("junyanGithubToken");
  if (!token) {
    alert("请先填写 GitHub 写入 token");
    return;
  }
  sessionStorage.setItem("junyanGithubToken", token);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  setStatus("正在校验 GitHub token...");
  await validateGitHubToken(headers);
  if (state.excelUpload) {
    setStatus("正在上传 Excel 原文件...");
    await uploadSourceExcel(headers);
    setStatus("正在触发后台解析同步...");
    await dispatchDataSyncWorkflow(headers);
  } else {
    setStatus("正在发布数据到 GitHub...");
    await updateRemoteDataFile(headers, token);
    setStatus("正在刷新前台部署...");
    await dispatchPagesWorkflow(headers);
  }
  localStorage.removeItem("junyanAdminDraft");
  setDirty(false);
  setStatus(state.excelUpload ? "Excel 已上传，GitHub 正在后台解析，约 1-3 分钟同步前台" : "已发布到 GitHub，前台约 5-30 秒刷新");
  alert(state.excelUpload ? "Excel 已上传成功。后台会自动解析并更新前台，通常需要 1-3 分钟。" : "发布成功，前台大屏会自动读取最新数据。");
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.data = JSON.parse(reader.result);
      state.excelUpload = null;
      state.month = state.data.latestMonth || state.data.months.at(-1);
      state.store = state.data.stores[0]?.name || null;
      recalcTotals();
      setDirty(true);
      renderAll();
    } catch (error) {
      alert(`JSON 导入失败：${error.message}`);
    }
  };
  reader.readAsText(file, "utf-8");
}

function sheetCell(sheet, row, col) {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  return sheet[address]?.v ?? null;
}

function readMonthHeaders(sheet, row, startCol) {
  return Array.from({ length: 12 }, (_, index) => normalizeMonthName(sheetCell(sheet, row, startCol + index)) || `${index + 1}月`);
}

function readMetricBlock(sheet, payload, titleRow, startCol, metric) {
  const months = readMonthHeaders(sheet, titleRow + 1, startCol + 1);
  months.forEach((month) => {
    if (!payload.months.includes(month)) payload.months.push(month);
  });
  let row = titleRow + 2;
  while (row < titleRow + 80) {
    const name = normalizeStoreName(sheetCell(sheet, row, startCol));
    if (!name) break;
    const store = ensurePayloadStore(payload, name);
    months.forEach((month, index) => {
      const value = numeric(sheetCell(sheet, row, startCol + 1 + index));
      if (value !== null) {
        ensureMonth(store, month);
        store.monthly[month][metric] = value;
      }
    });
    row += 1;
  }
}

function readMonthlyComparison(workbook, payload) {
  const sheet = workbook.Sheets["2026月度数据对比"] || workbook.Sheets[workbook.SheetNames[6]];
  if (!sheet) throw new Error("没有找到 2026月度数据对比 工作表");
  readMetricBlock(sheet, payload, 1, 1, "orders");
  readMetricBlock(sheet, payload, 1, 15, "orderShare");
  readMetricBlock(sheet, payload, 22, 1, "leads");
  readMetricBlock(sheet, payload, 22, 15, "visits");
}

function readDetailSheet(workbook, payload) {
  const sheet = workbook.Sheets["数据明细"] || workbook.Sheets[workbook.SheetNames[7]];
  if (!sheet) throw new Error("没有找到 数据明细 工作表");
  const monthCols = [];
  for (let col = 5; col <= 24; col += 1) {
    const raw = String(sheetCell(sheet, 1, col) || "").trim();
    if (!raw || raw === "合计") break;
    const month = normalizeMonthName(raw);
    if (month) monthCols.push({ month, col });
  }
  if (!monthCols.length) {
    throw new Error("数据明细 工作表没有识别到月份列");
  }
  const months = monthCols.map((item) => item.month);
  months.forEach((month) => {
    if (!payload.months.includes(month)) payload.months.push(month);
  });
  const metricMap = {
    直播场次: "liveSessions",
    短视频发布: "shortVideos",
    投流费用: "spend",
  };
  let currentStore = null;
  for (let row = 2; row <= 260; row += 1) {
    const storeName = normalizeStoreName(sheetCell(sheet, row, 2));
    if (storeName) currentStore = storeName;
    const metricName = String(sheetCell(sheet, row, 4) || "").trim();
    const metric = metricMap[metricName];
    if (!currentStore || !metric) continue;
    const store = ensurePayloadStore(payload, currentStore);
    monthCols.forEach(({ month, col }) => {
      const value = numeric(sheetCell(sheet, row, col));
      if (value !== null) {
        ensureMonth(store, month);
        store.monthly[month][metric] = value;
      }
    });
  }
}

function monthFromSummaryTitle(value) {
  const text = String(value || "");
  const matches = [...text.matchAll(/(\d{1,2})月/g)];
  const match = matches.at(-1);
  return match ? `${Number(match[1])}月` : null;
}

function readLatestSummarySheet(workbook, payload) {
  const sheet = workbook.Sheets["总表-数据收集"] || workbook.Sheets[workbook.SheetNames[2]];
  if (!sheet) throw new Error("没有找到 总表-数据收集 工作表");
  const month = monthFromSummaryTitle(sheetCell(sheet, 2, 3)) || monthFromSummaryTitle(sheetCell(sheet, 1, 1));
  if (!month) throw new Error("总表-数据收集 未识别到月份");
  if (!payload.months.includes(month)) payload.months.push(month);
  for (let row = 5; row <= 80; row += 1) {
    const name = normalizeStoreName(sheetCell(sheet, row, 2));
    if (!name) continue;
    if (name === "合计") break;
    const store = ensurePayloadStore(payload, name);
    ensureMonth(store, month);
    const target = store.monthly[month];
    const mapping = {
      leads: 8,
      visits: 18,
      orders: 19,
      orderShare: 22,
    };
    Object.entries(mapping).forEach(([metric, col]) => {
      const value = numeric(sheetCell(sheet, row, col));
      if (value !== null) {
        if (metric === "orderShare") {
          target[metric] = value;
        } else {
          const previousTotal = payload.months
            .filter((item) => parseInt(item, 10) < parseInt(month, 10))
            .reduce((sum, item) => sum + Number(store.monthly?.[item]?.[metric] || 0), 0);
          target[metric] = Math.max(0, value - previousTotal);
        }
      }
    });
  }
}

function buildPayloadFromWorkbook(workbook, fileName) {
  const payload = {
    title: "骏延集团新媒体数据",
    sourceFile: fileName,
    generatedAt: new Date().toISOString().slice(0, 19),
    months: [],
    latestMonth: null,
    previousMonth: null,
    metrics: {
      liveSessions: "直播场次",
      shortVideos: "短视频发布",
      leads: "总线索量",
      visits: "邀约到店",
      orders: "新媒体订单",
      orderShare: "新媒体订单占零售占比",
      attritionRate: "门店离系率",
      spend: "投流费用",
    },
    stores: [],
    totals: {},
  };
  readMonthlyComparison(workbook, payload);
  readDetailSheet(workbook, payload);
  readLatestSummarySheet(workbook, payload);
  payload.months = [...new Set(payload.months)]
    .filter((month) => payload.stores.some((store) => Object.values(store.monthly?.[month] || {}).some(Boolean)))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  payload.stores.sort((a, b) => {
    const ai = STORE_ORDER.includes(a.name) ? STORE_ORDER.indexOf(a.name) : 999;
    const bi = STORE_ORDER.includes(b.name) ? STORE_ORDER.indexOf(b.name) : 999;
    return ai - bi || a.name.localeCompare(b.name, "zh-Hans-CN");
  });
  payload.stores.forEach((store) => {
    payload.months.forEach((month) => ensureMonth(store, month));
  });
  return payload;
}

function importExcelFile(file) {
  if (!window.XLSX) {
    alert("Excel 解析库没有加载成功，请刷新页面后重试。");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const workbook = XLSX.read(reader.result, { type: "array", cellDates: false });
      state.workbookPreview = workbookToPreview(workbook);
      state.previewSheet = workbook.SheetNames[0];
      state.excelUpload = {
        name: file.name,
        content: arrayBufferToBase64(reader.result),
      };
      try {
        state.data = buildPayloadFromWorkbook(workbook, file.name);
        state.month = state.data.months.at(-1);
        state.store = state.data.stores[0]?.name || null;
        recalcTotals();
      } catch (parseError) {
        console.warn("Browser preview parse failed; server sync will parse Excel.", parseError);
      }
      setDirty(true);
      renderAll();
      setStatus(`已导入 Excel：${file.name}。发布时将上传原文件，由 GitHub Actions 后台解析。`);
    } catch (error) {
      alert(`Excel 导入失败：${error.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

function importDataFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    importJsonFile(file);
    return;
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    importExcelFile(file);
    return;
  }
  alert("请导入 .xlsx、.xls 或 .json 文件");
}

document.querySelector("#unlockBtn").addEventListener("click", () => {
  const code = document.querySelector("#accessCode").value.trim();
  if (code !== ACCESS_CODE) {
    alert("管理口令不正确");
    return;
  }
  state.unlocked = true;
  document.querySelector("#editorArea").classList.remove("locked");
  const token = document.querySelector("#githubToken").value.trim();
  if (token) sessionStorage.setItem("junyanGithubToken", token);
});

document.querySelector("#monthSelect").addEventListener("change", (event) => {
  saveCurrentStore();
  state.month = event.target.value;
  renderAll();
});
document.querySelector("#storeSearch").addEventListener("input", renderStores);
document.querySelector("#sheetSelect").addEventListener("change", (event) => {
  state.previewSheet = event.target.value;
  renderExcelPreview();
});
document.querySelector("#saveStoreBtn").addEventListener("click", saveCurrentStore);
document.querySelector("#saveLocalBtn").addEventListener("click", saveDraft);
document.querySelector("#addStoreBtn").addEventListener("click", addStore);
document.querySelector("#renameStoreBtn").addEventListener("click", renameStore);
document.querySelector("#deleteStoreBtn").addEventListener("click", deleteStore);
document.querySelector("#addMonthBtn").addEventListener("click", addMonth);
document.querySelector("#exportBtn").addEventListener("click", exportJson);
document.querySelector("#publishBtn").addEventListener("click", () => publishToGitHub().catch((error) => {
  setStatus(`发布失败：${error.message}`);
  alert(`发布失败：${error.message}`);
}));
document.querySelector("#resetRemoteBtn").addEventListener("click", async () => {
  localStorage.removeItem("junyanAdminDraft");
  await loadData();
});
document.querySelector("#dataFile").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importDataFile(file);
});

document.querySelectorAll("[data-metric]").forEach((input) => {
  input.addEventListener("change", () => setDirty(true));
});

loadData().catch((error) => {
  setStatus(error.message);
  alert(error.message);
});
