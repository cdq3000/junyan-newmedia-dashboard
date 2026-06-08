const REMOTE_DATA_URL = "https://raw.githubusercontent.com/cdq3000/junyan-newmedia-dashboard/main/data/dashboard-data.json";
const LOCAL_DATA_URL = "./data/dashboard-data.json";
const POLL_MS = 5000;
const COLORS = ["#20e3ff", "#4f7cff", "#8f6cff", "#4dffb6", "#ffcc66", "#ff6b8a"];
const KPI_KEYS = ["liveSessions", "shortVideos", "leads", "visits", "orders", "orderShare"];
const DISPLAY_METRICS = [
  "liveSessions",
  "shortVideos",
  "leads",
  "visits",
  "orders",
  "visitRate",
  "closeRate",
  "leadOrderRate",
  "orderShare",
  "attritionRate",
];
const DERIVED_LABELS = {
  visitRate: "线索到店转化率",
  closeRate: "到店订单转化率",
  leadOrderRate: "线索订单转化率",
  attritionRate: "门店离系率",
};
const PERCENT_METRICS = new Set(["orderShare", "visitRate", "closeRate", "leadOrderRate", "attritionRate"]);

let state = {
  data: null,
  month: null,
  store: "集团合计",
  chartMetric: "leads",
  generatedAt: null,
  dataSource: "GitHub 数据仓库",
};

const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function valueText(key, value) {
  if (PERCENT_METRICS.has(key)) return pctFmt.format(value || 0);
  if (key === "spend") return `¥${fmt.format(value || 0)}`;
  return fmt.format(value || 0);
}

function metricValue(entity, month, key) {
  const values = entity?.monthly?.[month] || {};
  if (key === "visitRate") return values.leads ? (values.visits || 0) / values.leads : 0;
  if (key === "closeRate") return values.visits ? (values.orders || 0) / values.visits : 0;
  if (key === "leadOrderRate") return values.leads ? (values.orders || 0) / values.leads : 0;
  return values[key] || 0;
}

function metricLabel(key) {
  return state.data?.metrics?.[key] || DERIVED_LABELS[key] || key;
}

function totalsAsEntity(data) {
  return {
    name: "集团合计",
    monthly: Object.fromEntries(data.months.map((month) => [month, data.totals[month]])),
  };
}

function getSelectedEntity() {
  if (!state.data) return null;
  if (state.store === "集团合计") return totalsAsEntity(state.data);
  return state.data.stores.find((item) => item.name === state.store) || totalsAsEntity(state.data);
}

function changeRate(current, previous) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function animateNumber(el, target, key) {
  const duration = 900;
  const start = performance.now();
  const from = 0;
  const to = Number(target || 0);
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = valueText(key, from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderControls() {
  const monthSelect = document.querySelector("#monthSelect");
  const storeSelect = document.querySelector("#storeSelect");
  const metricSelect = document.querySelector("#metricSelect");
  monthSelect.innerHTML = state.data.months.map((month) => `<option value="${month}">${month}</option>`).join("");
  monthSelect.value = state.month;

  const stores = ["集团合计", ...state.data.stores.map((item) => item.name)];
  storeSelect.innerHTML = stores.map((name) => `<option value="${name}">${name}</option>`).join("");
  storeSelect.value = state.store;

  metricSelect.innerHTML = DISPLAY_METRICS.map((key) => `<option value="${key}">${metricLabel(key)}</option>`).join("");
  metricSelect.value = state.chartMetric;
}

function renderKpis() {
  const grid = document.querySelector("#kpiGrid");
  const entity = getSelectedEntity();
  const previous = state.data.previousMonth;
  grid.innerHTML = KPI_KEYS.map((key, index) => {
    const current = metricValue(entity, state.month, key);
    const prev = previous ? metricValue(entity, previous, key) : 0;
    const rate = changeRate(current, prev);
    const isDown = rate < 0;
    return `
      <article class="kpi-card ${index === 2 || index === 4 ? "hot" : ""}" style="--accent:${COLORS[index]}">
        <div class="kpi-label">${state.data.metrics[key]}</div>
        <strong class="kpi-value" data-key="${key}" data-value="${current}">0</strong>
        <div class="kpi-change ${isDown ? "down" : ""}">${previous ? `${isDown ? "" : "+"}${pctFmt.format(rate)} 较${previous}` : "首月数据"}</div>
      </article>
    `;
  }).join("");
  grid.querySelectorAll(".kpi-value").forEach((el) => animateNumber(el, el.dataset.value, el.dataset.key));
}

function renderBars() {
  const scene = document.querySelector("#barScene");
  const metric = state.chartMetric;
  document.querySelector("#barTitle").textContent = `门店${state.month}${metricLabel(metric)}排行`;
  const previousMonth = state.data.previousMonth;
  const ranked = state.data.stores
    .map((store) => ({
      name: store.name,
      value: metricValue(store, state.month, metric),
      previous: previousMonth ? metricValue(store, previousMonth, metric) : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...ranked.map((item) => item.value), PERCENT_METRICS.has(metric) ? 0.01 : 1);
  scene.innerHTML = ranked.map((item, index) => {
    const width = Math.max(3, (item.value / max) * 100);
    const accent = COLORS[index % COLORS.length];
    const rate = previousMonth ? changeRate(item.value, item.previous) : 0;
    const isDown = rate < 0;
    return `
      <div class="ranking-row ${index < 3 ? "top" : ""}" style="--accent:${accent}">
        <div class="rank-index">#${String(index + 1).padStart(2, "0")}</div>
        <div class="rank-store" title="${item.name}">${item.name}</div>
        <div class="rank-bar-track">
          <div class="rank-bar-fill" style="--w:${width}%"></div>
        </div>
        <div class="rank-value">${valueText(metric, item.value)}</div>
        <div class="rank-change ${isDown ? "down" : ""}">${previousMonth ? `${isDown ? "" : "+"}${pctFmt.format(rate)}` : "-"}</div>
      </div>
    `;
  }).join("");
  scene.className = "ranking-board";
  renderConnectors([]);
}

function renderConnectors(items) {
  const svg = document.querySelector("#connectorSvg");
  const points = items.slice(0, 6).map((_, index) => {
    const x = 120 + index * 150;
    const y = index % 2 ? 190 : 115;
    return [x, y];
  });
  const paths = points.slice(1).map((point, index) => {
    const [x1, y1] = points[index];
    const [x2, y2] = point;
    const c1 = x1 + 80;
    const c2 = x2 - 80;
    return `<path class="connector-path" d="M ${x1} ${y1} C ${c1} ${y1 - 60}, ${c2} ${y2 + 60}, ${x2} ${y2}" />`;
  }).join("");
  const nodes = points.map(([x, y], index) => `
    <circle cx="${x}" cy="${y}" r="${6 + index}" fill="${COLORS[index % COLORS.length]}" filter="url(#nodeGlow)" />
  `).join("");
  svg.innerHTML = `
    <defs>
      <linearGradient id="connectorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop stop-color="#20e3ff"/>
        <stop offset="55%" stop-color="#8f6cff"/>
        <stop offset="100%" stop-color="#4dffb6"/>
      </linearGradient>
      <filter id="nodeGlow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${paths}
    ${nodes}
  `;
}

function renderRings() {
  const rings = document.querySelector("#rings");
  const entity = getSelectedEntity();
  const leads = metricValue(entity, state.month, "leads");
  const visits = metricValue(entity, state.month, "visits");
  const orders = metricValue(entity, state.month, "orders");
  const share = metricValue(entity, state.month, "orderShare");
  const defs = [
    { label: "线索到店率", value: leads ? visits / leads : 0, accent: COLORS[0] },
    { label: "到店成交率", value: visits ? orders / visits : 0, accent: COLORS[3] },
    { label: "订单零售占比", value: share || 0, accent: COLORS[4] },
  ];
  const radius = 45;
  const circumference = Math.PI * 2 * radius;
  rings.innerHTML = defs.map((item) => {
    const clamped = Math.max(0, Math.min(item.value, 1));
    return `
      <div class="ring-item" style="--accent:${item.accent}">
        <svg class="ring-svg" viewBox="0 0 116 116">
          <circle class="ring-track" cx="58" cy="58" r="${radius}"></circle>
          <circle class="ring-progress" cx="58" cy="58" r="${radius}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference * (1 - clamped)}"></circle>
        </svg>
        <div class="ring-copy">
          <strong>${pctFmt.format(item.value)}</strong>
          <span>${item.label}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderInsights() {
  const box = document.querySelector("#insightBox");
  const entity = getSelectedEntity();
  const prev = state.data.previousMonth;
  const leads = metricValue(entity, state.month, "leads");
  const orders = metricValue(entity, state.month, "orders");
  const visits = metricValue(entity, state.month, "visits");
  const leadChange = prev ? changeRate(leads, metricValue(entity, prev, "leads")) : 0;
  const orderChange = prev ? changeRate(orders, metricValue(entity, prev, "orders")) : 0;
  const bestStore = state.data.stores
    .map((store) => ({ name: store.name, orders: metricValue(store, state.month, "orders") }))
    .sort((a, b) => b.orders - a.orders)[0];
  box.innerHTML = `
    <strong>${state.store} · ${state.month}</strong><br>
    线索 ${valueText("leads", leads)}，到店 ${valueText("visits", visits)}，订单 ${valueText("orders", orders)}。
    ${prev ? `线索环比 ${leadChange >= 0 ? "增长" : "下降"} ${pctFmt.format(Math.abs(leadChange))}，订单环比 ${orderChange >= 0 ? "增长" : "下降"} ${pctFmt.format(Math.abs(orderChange))}。` : ""}
    当前订单最高门店：${bestStore?.name || "-"}（${valueText("orders", bestStore?.orders || 0)}）。
  `;
}

function chartPoints(values, width, height, pad) {
  const max = Math.max(...values, 1);
  return values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = height - pad - (value / max) * (height - pad * 2);
    return [x, y];
  });
}

function renderTrend() {
  const svg = document.querySelector("#trendChart");
  const entity = getSelectedEntity();
  const width = 1200;
  const height = 300;
  const pad = 38;
  const months = state.data.months;
  const metric = state.chartMetric;
  document.querySelector("#trendTitle").textContent = `${state.store}${metricLabel(metric)}月度变化趋势`;
  const primary = months.map((month) => metricValue(entity, month, metric));
  const orders = months.map((month) => metricValue(entity, month, "orders") * (PERCENT_METRICS.has(metric) ? 0.01 : 80));
  const leadPts = chartPoints(primary, width, height, pad);
  const orderPts = chartPoints(orders, width, height, pad);
  const line = (pts) => pts.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
  const area = (pts) => `${line(pts)} L ${pts.at(-1)[0]} ${height - pad} L ${pts[0][0]} ${height - pad} Z`;
  const labels = months.map((month, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(months.length - 1, 1);
    return `<text class="trend-label" x="${x}" y="286" text-anchor="middle">${month}</text>`;
  }).join("");
  const grid = [0, 1, 2, 3].map((i) => {
    const y = pad + i * 62;
    return `<line class="grid-line" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" />`;
  }).join("");
  svg.innerHTML = `
    <defs>
      <linearGradient id="leadArea" x1="0" x2="0" y1="0" y2="1">
        <stop stop-color="#20e3ff"/>
        <stop offset="1" stop-color="#20e3ff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="orderArea" x1="0" x2="0" y1="0" y2="1">
        <stop stop-color="#ffcc66"/>
        <stop offset="1" stop-color="#ffcc66" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path class="trend-area" d="${area(leadPts)}" fill="url(#leadArea)"></path>
    <path class="trend-line" d="${line(leadPts)}" stroke="#20e3ff" style="color:#20e3ff"></path>
    <path class="trend-area" d="${area(orderPts)}" fill="url(#orderArea)"></path>
    <path class="trend-line" d="${line(orderPts)}" stroke="#ffcc66" style="color:#ffcc66;animation-delay:150ms"></path>
    ${leadPts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#20e3ff"></circle>`).join("")}
    ${orderPts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#ffcc66"></circle>`).join("")}
    ${labels}
  `;
}

function renderTable() {
  const rows = document.querySelector("#storeRows");
  const prev = state.data.previousMonth;
  const metric = state.chartMetric;
  rows.innerHTML = state.data.stores.map((store) => {
    const m = store.monthly[state.month];
    const current = metricValue(store, state.month, metric);
    const previous = prev ? metricValue(store, prev, metric) : 0;
    const rate = changeRate(current, previous);
    return `
      <tr>
        <td>${store.name}</td>
        <td>${valueText("liveSessions", m.liveSessions)}</td>
        <td>${valueText("shortVideos", m.shortVideos)}</td>
        <td>${valueText("leads", m.leads)}</td>
        <td>${valueText("visits", m.visits)}</td>
        <td>${valueText("orders", m.orders)}</td>
        <td>${valueText("orderShare", m.orderShare)}</td>
        <td class="${rate < 0 ? "kpi-change down" : "kpi-change"}">${valueText(metric, current)} / ${prev ? `${rate >= 0 ? "+" : ""}${pctFmt.format(rate)}` : "-"}</td>
      </tr>
    `;
  }).join("");
}

function renderAll() {
  if (!state.data) return;
  renderControls();
  renderKpis();
  renderBars();
  renderRings();
  renderInsights();
  renderTrend();
  renderTable();
}

async function loadData() {
  try {
    let response = await fetch(`${REMOTE_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    state.dataSource = "GitHub raw 实时数据";
    if (!response.ok) {
      response = await fetch(`${LOCAL_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      state.dataSource = "本地数据文件";
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.generatedAt === state.generatedAt && state.data) return;
    state.data = data;
    state.generatedAt = data.generatedAt;
    state.month = state.month && data.months.includes(state.month) ? state.month : data.latestMonth;
    state.chartMetric = DISPLAY_METRICS.includes(state.chartMetric) ? state.chartMetric : "leads";
    const storeNames = new Set(["集团合计", ...data.stores.map((store) => store.name)]);
    state.store = storeNames.has(state.store) ? state.store : "集团合计";
    document.querySelector("#syncBadge").textContent = `已同步 ${data.generatedAt.replace("T", " ")}`;
    document.querySelector("#dataSourceLabel").textContent = state.dataSource;
    renderAll();
  } catch (error) {
    document.querySelector("#syncBadge").textContent = "等待数据同步";
    console.error(error);
  }
}

document.querySelector("#monthSelect").addEventListener("change", (event) => {
  state.month = event.target.value;
  renderAll();
});

document.querySelector("#storeSelect").addEventListener("change", (event) => {
  state.store = event.target.value;
  renderAll();
});

document.querySelector("#metricSelect").addEventListener("change", (event) => {
  state.chartMetric = event.target.value;
  renderAll();
});

loadData();
setInterval(loadData, POLL_MS);
