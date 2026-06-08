const REPO = "cdq3000/junyan-newmedia-dashboard";
const DATA_PATH = "data/dashboard-data.json";
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

let state = {
  unlocked: false,
  dirty: false,
  data: null,
  month: null,
  store: null,
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

function ensureMonth(store, month) {
  store.monthly ||= {};
  store.monthly[month] ||= clone(ZERO_METRICS);
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
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
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
  const getUrl = `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}?ref=main`;
  const current = await fetch(getUrl, { headers });
  if (!current.ok) throw new Error(`读取远程数据失败 HTTP ${current.status}`);
  const info = await current.json();
  const body = {
    message: `Update dashboard data ${state.data.generatedAt}`,
    content: toBase64Utf8(JSON.stringify(state.data, null, 2)),
    sha: info.sha,
    branch: "main",
  };
  const update = await fetch(`https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!update.ok) {
    const text = await update.text();
    throw new Error(`发布失败 HTTP ${update.status}: ${text}`);
  }
  localStorage.removeItem("junyanAdminDraft");
  setDirty(false);
  setStatus("已发布到 GitHub，前台约 5-30 秒刷新");
  alert("发布成功，前台大屏会自动读取最新数据。");
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.data = JSON.parse(reader.result);
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
document.querySelector("#saveStoreBtn").addEventListener("click", saveCurrentStore);
document.querySelector("#saveLocalBtn").addEventListener("click", saveDraft);
document.querySelector("#addStoreBtn").addEventListener("click", addStore);
document.querySelector("#renameStoreBtn").addEventListener("click", renameStore);
document.querySelector("#deleteStoreBtn").addEventListener("click", deleteStore);
document.querySelector("#addMonthBtn").addEventListener("click", addMonth);
document.querySelector("#exportBtn").addEventListener("click", exportJson);
document.querySelector("#publishBtn").addEventListener("click", () => publishToGitHub().catch((error) => alert(error.message)));
document.querySelector("#resetRemoteBtn").addEventListener("click", async () => {
  localStorage.removeItem("junyanAdminDraft");
  await loadData();
});
document.querySelector("#jsonFile").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importJsonFile(file);
});

document.querySelectorAll("[data-metric]").forEach((input) => {
  input.addEventListener("change", () => setDirty(true));
});

loadData().catch((error) => {
  setStatus(error.message);
  alert(error.message);
});
