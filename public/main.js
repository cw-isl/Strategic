// 작은 라우터 + API 연동 + 모달 신규등록

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

const routes = {
  "/": renderHome,
  "/export": renderExport,
};

function setTopbarActive(pathname) {
  $$(".topbar .tab").forEach(a => {
    a.setAttribute("aria-current", a.getAttribute("href") === pathname ? "page" : "false");
  });
}

function renderHome() {
  setTopbarActive("/");
  document.title = "HOME | 수출 및 전략물자";
  app.innerHTML = `
    <section class="card">
      <h2>환영합니다 👋</h2>
      <p>좌측 메뉴에서 <strong>수출현황</strong>을 선택해 시작하세요.</p>
    </section>
  `;
  app.focus();
}

function renderExport() {
  setTopbarActive("/export");
  document.title = "수출현황 | 수출 및 전략물자";

  app.innerHTML = `
    <h2>수출현황</h2>
    <section class="search-panel" role="search">
      <div class="row">
        <input id="q" type="text" placeholder="품목/국가/상태로 검색" aria-label="검색어" />
      </div>
      <div class="row">
        <button id="searchBtn" class="btn">Search</button>
      </div>
    </section>

    <div style="margin-top:.5rem; display:flex; justify-content:flex-end;">
      <button id="newBtn" class="btn">수출 신규등록</button>
    </div>

    <div class="table-wrap">
      <table aria-label="수출 목록">
        <thead>
          <tr>
            <th style="width:60px;">no</th>
            <th>품목</th>
            <th style="width:100px;">수량</th>
            <th style="width:120px;">단가(USD)</th>
            <th style="width:120px;">금액(USD)</th>
            <th style="width:110px;">국가</th>
            <th style="width:110px;">상태</th>
            <th style="width:160px;">등록일</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  // 이벤트
  $("#searchBtn").addEventListener("click", () => fetchAndRender());
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") fetchAndRender(); });
  $("#newBtn").addEventListener("click", openNewDialog);

  fetchAndRender();
  app.focus();
}

async function fetchAndRender() {
  const q = $("#q")?.value?.trim() || "";
  const res = await fetch(`/api/exports?query=${encodeURIComponent(q)}`);
  const data = await res.json();
  const tbody = $("#tbody");
  tbody.innerHTML = data.items.map((row, idx) => {
    const no = row.id;
    const amount = (row.qty * row.unitPrice).toFixed(2);
    return `
      <tr>
        <td>${no}</td>
        <td>${escapeHtml(row.item)}</td>
        <td>${row.qty}</td>
        <td>${row.unitPrice.toFixed(2)}</td>
        <td>${amount}</td>
        <td>${escapeHtml(row.country)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${new Date(row.createdAt).toLocaleString()}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="8" style="text-align:center;color:#777;">데이터가 없습니다.</td></tr>`;
}

function openNewDialog() {
  const dialog = $("#newExportDialog");
  const form = $("#newExportForm");
  form.reset();
  dialog.showModal();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      item: String(fd.get("item") || "").trim(),
      qty: Number(fd.get("qty") || 0),
      unitPrice: Number(fd.get("unitPrice") || 0),
      country: String(fd.get("country") || "").trim(),
      status: String(fd.get("status") || "대기"),
    };
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("등록 실패");
      dialog.close();
      // 목록 갱신
      if (location.pathname === "/export") fetchAndRender();
    } catch (err) {
      alert(err.message || "등록 중 오류");
    }
  };
}

/* Router */
function navigate(pathname) {
  if (location.pathname === pathname) return;
  window.history.pushState({}, "", pathname);
  render(pathname);
}
function render(pathname = location.pathname) {
  (routes[pathname] || renderNotFound)();
}
function renderNotFound() {
  document.title = "404";
  app.innerHTML = `<section class="card"><h2>404</h2><p>페이지를 찾을 수 없습니다.</p></section>`;
  app.focus();
}

/* Delegated nav (topbar & side menu) */
window.addEventListener("click", (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) { e.preventDefault(); navigate(a.getAttribute("href")); return; }
  const btn = e.target.closest('.menu-item[data-link]');
  if (btn) { e.preventDefault(); navigate(btn.dataset.link); return; }
});
window.addEventListener("popstate", () => render());

/* Utils */
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}

// 초기화
$("#year").textContent = new Date().getFullYear();
render("/");