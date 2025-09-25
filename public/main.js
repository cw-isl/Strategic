// 작은 라우터 + API 연동 + 모달 신규등록

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

const PAGE_SIZE = 20;
const EXPORT_TABLE_COLSPAN = 22;
let currentPage = 1;
let currentQuery = "";
let lastMeta = { totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE };
let lastServerMeta = { totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE };
let lastFetchedItems = [];
const draftEntries = [];
let draftSeq = -1;

const menuContainer = $("[data-menu]");
const menuButton = menuContainer?.querySelector("[data-menu-button]");
const menuPanel = menuContainer?.querySelector(".menu-panel");

const infoPageConfigs = {
  "/strategic-check": {
    title: "전략물자 여부 체크",
    description: "전략물자 여부를 확인하기 위한 기본 절차와 체크리스트를 제공합니다.",
    body: `
      <ol class="info-list">
        <li>품목 분류와 HS Code를 검토하세요.</li>
        <li>전략물자 판정 기준표와 비교하여 해당 여부를 확인합니다.</li>
        <li>판정이 어려운 경우 담당 부서에 전문가 상담을 요청합니다.</li>
      </ol>
      <p class="info-note">체크 결과는 내부 기록으로 남겨 추후 감사 대비에 활용할 수 있습니다.</p>
    `,
  },
  "/expert-certificate": {
    title: "전략물자 전문판정서",
    description: "전문판정서 신청 절차와 준비 서류를 빠르게 확인하세요.",
    body: `
      <ul class="info-list">
        <li>필수 서류: 신청서, 품목 규격서, 거래계약서</li>
        <li>평균 처리 기간: 5~7 영업일</li>
        <li>진행 상황은 담당자 알림으로 안내됩니다.</li>
      </ul>
    `,
  },
  "/regulation": {
    title: "수출관리규정",
    description: "수출관리규정 전문과 최신 개정 사항을 확인하세요.",
    body: `
      <p class="info-note">규정 원문과 개정 이력은 내부 문서함에서 다운로드할 수 있습니다.</p>
    `,
  },
  "/settings": {
    title: "설정",
    description: "개인화된 알림과 즐겨찾기 메뉴를 관리하세요.",
    body: `
      <ul class="info-list">
        <li>즐겨찾는 대시보드와 메뉴를 지정합니다.</li>
        <li>이메일 및 SMS 알림을 켜거나 끕니다.</li>
        <li>팀 권한과 사용자 정보를 최신 상태로 유지하세요.</li>
      </ul>
    `,
  },
};

const routes = {
  "/": renderHome,
  "/export": renderExport,
};

Object.entries(infoPageConfigs).forEach(([path, config]) => {
  routes[path] = () => renderInfoPage(path, config);
});

const menuRoutes = new Set(["/export", ...Object.keys(infoPageConfigs)]);
let menuOpen = false;

function setMenuOpen(open = false) {
  if (!menuContainer) return;
  menuOpen = Boolean(open);
  menuContainer.classList.toggle("open", menuOpen);
  if (menuButton) {
    menuButton.setAttribute("aria-expanded", menuOpen ? "true" : "false");
  }
  if (menuPanel) {
    menuPanel.hidden = !menuOpen;
  }
}

if (menuButton) {
  menuButton.addEventListener("click", () => setMenuOpen(!menuOpen));
}

document.addEventListener("click", (event) => {
  if (!menuOpen || !menuContainer) return;
  if (menuContainer.contains(event.target)) return;
  setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuOpen) {
    setMenuOpen(false);
    menuButton?.focus();
  }
});

setMenuOpen(false);

function setTopbarActive(pathname) {
  const homeTab = $("[data-top=\"home\"]");
  if (homeTab) {
    if (pathname === "/") {
      homeTab.setAttribute("aria-current", "page");
    } else {
      homeTab.removeAttribute("aria-current");
    }
  }

  if (menuButton) {
    if (menuRoutes.has(pathname)) {
      menuButton.setAttribute("data-active", "true");
    } else {
      menuButton.removeAttribute("data-active");
    }
  }

  if (menuContainer) {
    $$(".menu-item", menuContainer).forEach((item) => {
      const href = item.getAttribute("href");
      if (href === pathname) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }
}

function renderHome() {
  setTopbarActive("/");
  document.title = "HOME | 수출 및 전략물자";
  app.innerHTML = `
    <section class="card hero">
      <div class="hero-text">
        <h1>환영합니다 👋</h1>
        <p>상단의 <strong>수출 및 전략물자</strong> 탭에서 최신 수출현황을 확인해 보세요.</p>
      </div>
      <a class="btn primary" href="/export" data-link role="button">수출현황 바로가기</a>
    </section>
    <section class="card quick-guide">
      <h2>빠른 가이드</h2>
      <ul class="guide-list">
        <li>검색창에 품목, 국가 또는 상태를 입력해 원하는 데이터를 빠르게 찾을 수 있습니다.</li>
        <li>새로운 수출 건은 <strong>수출 신규등록</strong> 버튼으로 즉시 추가하세요.</li>
        <li>등록된 정보는 실시간으로 반영되어 목록에서 바로 확인할 수 있습니다.</li>
      </ul>
    </section>
  `;
  app.focus();
}

function renderExport() {
  setTopbarActive("/export");
  document.title = "수출현황 | 수출 및 전략물자";

  currentPage = 1;
  currentQuery = "";
  lastMeta = { totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE };

  app.innerHTML = `
    <section class="page-header">
      <div>
        <h1>수출현황</h1>
        <p class="page-description">등록된 수출 건을 검색하고 신규 데이터를 추가하세요.</p>
      </div>
      <div class="header-actions">
        <button id="newBtn" class="btn primary" type="button">신규등록</button>
        <button id="reportBtn" class="btn" type="button">수출신고</button>
        <button id="pickupBtn" class="btn" type="button">픽업요청</button>
      </div>
    </section>

    <section class="card search-panel" role="search">
      <div class="search-input">
        <input id="q" type="text" placeholder="품목/국가/상태로 검색" aria-label="검색어" />
      </div>
      <div class="search-actions">
        <button id="searchBtn" class="btn" type="button">검색</button>
      </div>
    </section>

    <section class="card table-card">
      <div class="table-wrap">
        <table class="export-table" aria-label="수출 목록">
          <colgroup>
            <col class="col-no" />
            <col class="col-type" />
            <col class="col-date" />
            <col class="col-project" />
            <col class="col-project-code" />
            <col class="col-item" />
            <col class="col-qty" />
            <col class="col-client" />
            <col class="col-end-user" />
            <col class="col-country" />
            <col class="col-dept" />
            <col class="col-manager" />
            <col class="col-select" />
            <col class="col-pl" />
            <col class="col-invoice" />
            <col class="col-permit" />
            <col class="col-declaration" />
            <col class="col-usage" />
            <col class="col-bl" />
            <col class="col-file" />
            <col class="col-status" />
            <col class="col-note" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" rowspan="2">NO</th>
              <th scope="col" rowspan="2">출고유형</th>
              <th scope="col" rowspan="2">출고일</th>
              <th scope="col" rowspan="2">프로젝트명</th>
              <th scope="col" rowspan="2">프로젝트코드</th>
              <th scope="col" rowspan="2">품목명</th>
              <th scope="col" rowspan="2">수량</th>
              <th scope="col" rowspan="2">거래처</th>
              <th scope="col" rowspan="2">최종사용자</th>
              <th scope="col" rowspan="2">수출국가</th>
              <th scope="col" rowspan="2">담당부서</th>
              <th scope="col" rowspan="2">담당자</th>
              <th scope="col" rowspan="2">선택</th>
              <th scope="colgroup" colspan="6">수출증빙</th>
              <th scope="col" rowspan="2">파일등록 및 수정</th>
              <th scope="col" rowspan="2">진행상황</th>
              <th scope="col" rowspan="2">비고</th>
            </tr>
            <tr>
              <th scope="col">PL</th>
              <th scope="col">INVOICE</th>
              <th scope="col">전략물자 수출허가서</th>
              <th scope="col">수출신고서</th>
              <th scope="col">최종사용자/용도확인</th>
              <th scope="col">B/L</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      <div class="table-footer">
        <p id="resultCount" class="result-count" role="status" aria-live="polite">총 0건</p>
        <div class="pagination" id="pagination" role="navigation" aria-label="페이지 이동"></div>
      </div>
    </section>
  `;

  // 이벤트
  const searchInput = $("#q");
  $("#searchBtn").addEventListener("click", () => {
    fetchAndRender({ query: searchInput?.value ?? "" });
  });
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchAndRender({ query: searchInput.value });
    }
  });
  $("#newBtn").addEventListener("click", openNewDialog);
  $("#pagination").addEventListener("click", onPaginationClick);

  fetchAndRender({ page: 1 });
  app.focus();
}

function renderInfoPage(pathname, config) {
  setTopbarActive(pathname);
  document.title = `${config.title} | 수출 및 전략물자`;
  app.innerHTML = `
    <section class="card info-card">
      <h1>${config.title}</h1>
      <p class="page-description">${config.description}</p>
      ${config.body ?? ""}
    </section>
  `;
  app.focus();
}

async function fetchAndRender({ page, query } = {}) {
  if (typeof query === "string") {
    currentQuery = query.trim();
    currentPage = 1;
  }

  const targetPage = page ?? currentPage;
  const params = new URLSearchParams({
    query: currentQuery,
    page: String(Math.max(targetPage, 1)),
    pageSize: String(PAGE_SIZE),
  });

  try {
    const res = await fetch(`/api/exports?${params.toString()}`);
    if (!res.ok) throw new Error("목록을 불러오지 못했습니다.");

    const data = await res.json();
    const totalPages = Number(data.totalPages ?? 0);
    const pageFromServer = totalPages === 0 ? 1 : Number(data.page ?? 1);

    currentPage = pageFromServer;
    lastServerMeta = {
      totalPages,
      totalCount: Number(data.totalCount ?? 0),
      pageSize: Number(data.pageSize ?? PAGE_SIZE),
    };
    lastFetchedItems = data.items ?? [];

    const combinedRows = getCombinedRows(lastFetchedItems, { page: currentPage });
    renderRows(combinedRows, { page: currentPage });
    updateMeta();
    renderPagination();

    const searchInput = $("#q");
    if (searchInput && searchInput.value.trim() !== currentQuery) {
      searchInput.value = currentQuery;
    }
  } catch (err) {
    console.error(err);
    const tbody = $("#tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${EXPORT_TABLE_COLSPAN}" class="error">${escapeHtml(
        err.message || "목록을 불러오지 못했습니다."
      )}</td></tr>`;
    }
    const pagination = $("#pagination");
    const resultCount = $("#resultCount");
    if (pagination) pagination.innerHTML = "";
    if (resultCount) resultCount.textContent = "총 0건";
  }
}

function renderRows(rows = [], meta = {}) {
  const tbody = $("#tbody");
  if (!tbody) return;

  const page = meta.page ?? 1;
  const pageSize = lastMeta.pageSize ?? PAGE_SIZE;
  const startIndex = (page - 1) * pageSize;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${EXPORT_TABLE_COLSPAN}" data-empty="true">데이터가 없습니다.</td></tr>`;
    return;
  }

  const qtyFormatter = new Intl.NumberFormat("ko-KR");

  const docValue = (value) => {
    if (value === undefined || value === null || value === "") return "-";
    return escapeHtml(String(value));
  };

  tbody.innerHTML = rows
    .map((row, idx) => {
      const seq = startIndex + idx + 1;
      const createdDate = formatDate(row.createdAt);
      const shipmentType = row.shipmentType ? escapeHtml(String(row.shipmentType)) : "-";
      const projectName = row.projectName ? escapeHtml(String(row.projectName)) : "-";
      const projectCode = row.projectCode ? escapeHtml(String(row.projectCode)) : "-";
      const item = row.item ? escapeHtml(String(row.item)) : "-";
      const qty = formatNumber(row.qty, qtyFormatter);
      const client = row.client ? escapeHtml(String(row.client)) : "-";
      const endUser = row.endUser ? escapeHtml(String(row.endUser)) : "-";
      const country = row.country ? escapeHtml(String(row.country).toUpperCase()) : "-";
      const department = row.department ? escapeHtml(String(row.department)) : "-";
      const manager = row.manager ? escapeHtml(String(row.manager)) : "-";
      const status = row.status ? escapeHtml(String(row.status)) : "-";
      const note = row.note ? escapeHtml(String(row.note)) : "-";
      const plStatus = docValue(row.plStatus);
      const invoiceStatus = docValue(row.invoiceStatus);
      const permitStatus = docValue(row.permitStatus);
      const declarationStatus = docValue(row.declarationStatus);
      const usageStatus = docValue(row.usageStatus);
      const blStatus = docValue(row.blStatus);
      const fileNote = docValue(row.fileNote);
      const selectBox = "<input type='checkbox' disabled aria-label='선택' />";
      const rowAttrs = row.isDraft ? " data-draft=\"true\"" : "";

      return `
        <tr${rowAttrs}>
          ${td(String(seq), { align: "center" })}
          ${td(shipmentType, { empty: shipmentType === "-" })}
          ${td(createdDate, { empty: createdDate === "-" })}
          ${td(projectName, { align: "left", empty: projectName === "-" })}
          ${td(projectCode, { align: "left", empty: projectCode === "-" })}
          ${td(item, { align: "left", empty: item === "-" })}
          ${td(qty, { align: "right", empty: qty === "-" })}
          ${td(client, { align: "left", empty: client === "-" })}
          ${td(endUser, { align: "left", empty: endUser === "-" })}
          ${td(country, { align: "center", empty: country === "-" })}
          ${td(department, { align: "left", empty: department === "-" })}
          ${td(manager, { align: "left", empty: manager === "-" })}
          ${td(selectBox, { align: "center" })}
          ${td(plStatus, { empty: plStatus === "-" })}
          ${td(invoiceStatus, { empty: invoiceStatus === "-" })}
          ${td(permitStatus, { empty: permitStatus === "-" })}
          ${td(declarationStatus, { empty: declarationStatus === "-" })}
          ${td(usageStatus, { empty: usageStatus === "-" })}
          ${td(blStatus, { empty: blStatus === "-" })}
          ${td(fileNote, { align: "left", empty: fileNote === "-" })}
          ${td(status, { align: "left", empty: status === "-" })}
          ${td(note, { align: "left", empty: note === "-" })}
        </tr>
      `;
    })
    .join("");
}

function getCombinedRows(serverRows = [], { page } = {}) {
  const targetPage = page ?? currentPage;
  if (targetPage === 1) {
    return [...draftEntries, ...serverRows];
  }
  return serverRows;
}

function updateMeta() {
  const serverTotal = lastServerMeta.totalCount ?? 0;
  const totalCount = serverTotal + draftEntries.length;
  const serverPages = lastServerMeta.totalPages ?? 0;
  let totalPages = serverPages;
  if (totalCount === 0) {
    totalPages = 0;
  } else if (totalPages === 0) {
    totalPages = 1;
  }
  lastMeta = {
    totalPages,
    totalCount,
    pageSize: lastServerMeta.pageSize ?? PAGE_SIZE,
  };
}

function refreshAfterDraftChange() {
  updateMeta();
  const rows = getCombinedRows(lastFetchedItems, { page: currentPage });
  renderRows(rows, { page: currentPage });
  renderPagination();
}

function collectFormValues(form) {
  const data = {};
  const fd = new FormData(form);
  fd.forEach((value, key) => {
    if (typeof value === "string") {
      data[key] = value.trim();
    } else {
      data[key] = value;
    }
  });
  return data;
}

function mapFormDataToPayload(data = {}) {
  const trim = (val) => (typeof val === "string" ? val.trim() : "");
  const qtyValue = Number(data.qty ?? 0);
  const priceValue = Number(data.unitPrice ?? 0);
  const payload = {
    item: trim(data.item),
    qty: Number.isFinite(qtyValue) ? Math.max(0, Math.floor(qtyValue)) : 0,
    unitPrice: Number.isFinite(priceValue) ? Math.max(0, priceValue) : 0,
    country: trim(data.country),
    status: trim(data.status) || "대기",
    shipmentType: trim(data.shipmentType),
    shipmentDate: data.shipmentDate || "",
    shipmentPurpose: trim(data.shipmentPurpose),
    projectName: trim(data.projectName),
    projectCode: trim(data.projectCode),
    contractNumber: trim(data.contractNumber),
    itemSpec: trim(data.itemSpec),
    unit: trim(data.unit),
    client: trim(data.client),
    clientCountry: trim(data.clientCountry),
    clientManager: trim(data.clientManager),
    endUser: trim(data.endUser),
    endUserCountry: trim(data.endUserCountry),
    endUse: trim(data.endUse),
    transportMode: trim(data.transportMode),
    departureDate: data.departureDate || "",
    department: trim(data.department),
    manager: trim(data.manager),
    managerEmail: trim(data.managerEmail),
    strategicFlag: trim(data.strategicFlag),
    strategicCategory: trim(data.strategicCategory),
    strategicBasis: trim(data.strategicBasis),
    permitType: trim(data.permitType),
    permitNumber: trim(data.permitNumber),
    declarationNumber: trim(data.declarationNumber),
    plStatus: trim(data.plStatus || "미등록"),
    invoiceStatus: trim(data.invoiceStatus || "미등록"),
    permitStatus: trim(data.permitStatus || "미등록"),
    declarationStatus: trim(data.declarationStatus || "미등록"),
    usageStatus: trim(data.usageStatus || "미등록"),
    blStatus: trim(data.blStatus || "미등록"),
    fileNote: trim(data.fileNote),
    note: trim(data.note),
    companyName: trim(data.companyName),
    businessNumber: trim(data.businessNumber),
    contactName: trim(data.contactName),
    contactPhone: trim(data.contactPhone),
  };
  return payload;
}

function mapFormDataToRow(data = {}, { draft = false } = {}) {
  const payload = mapFormDataToPayload(data);
  const row = {
    ...payload,
    createdAt: Date.now(),
    qty: payload.qty,
    unitPrice: payload.unitPrice,
    status: draft ? "임시저장" : payload.status,
    note: payload.note || (draft ? "임시 저장" : ""),
    isDraft: draft,
  };
  row.country = payload.country ? payload.country.toUpperCase() : "";
  return row;
}

function addDraftEntry(data) {
  const row = mapFormDataToRow(data, { draft: true });
  row.id = `D${Date.now()}_${Math.abs(draftSeq--)}`;
  draftEntries.unshift(row);
  refreshAfterDraftChange();
}

function formHasInput(form) {
  const elements = Array.from(form.elements || []);
  return elements.some((el) => {
    if (!el || !el.name) return false;
    if (el.type === "button" || el.type === "submit" || el.type === "reset" || el.type === "hidden") return false;
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        return el.checked;
      }
      return el.value.trim() !== "";
    }
    if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      return (el.value || "").trim() !== "";
    }
    return false;
  });
}

function renderPagination() {
  const pagination = $("#pagination");
  const resultCount = $("#resultCount");
  if (!pagination || !resultCount) return;

  const totalCount = lastMeta.totalCount ?? 0;
  const totalPages = lastMeta.totalPages ?? 0;
  resultCount.textContent = `총 ${totalCount.toLocaleString("ko-KR")}건`;

  if (totalPages === 0) {
    pagination.innerHTML = `
      <div class="page-info" data-empty="true">0 / 0</div>
    `;
    return;
  }

  const disabledPrev = currentPage <= 1;
  const disabledNext = currentPage >= totalPages;

  pagination.innerHTML = `
    <button type="button" class="btn page-btn" data-page-action="first" ${
      disabledPrev ? "disabled" : ""
    } aria-label="첫 페이지">≪</button>
    <button type="button" class="btn page-btn" data-page-action="prev" ${
      disabledPrev ? "disabled" : ""
    } aria-label="이전 페이지">＜</button>
    <div class="page-info"><strong>${currentPage}</strong> / ${totalPages}</div>
    <button type="button" class="btn page-btn" data-page-action="next" ${
      disabledNext ? "disabled" : ""
    } aria-label="다음 페이지">＞</button>
    <button type="button" class="btn page-btn" data-page-action="last" ${
      disabledNext ? "disabled" : ""
    } aria-label="마지막 페이지">≫</button>
  `;
}

function onPaginationClick(event) {
  const button = event.target.closest("[data-page-action]");
  if (!button || button.disabled) return;

  const action = button.dataset.pageAction;
  const totalPages = lastMeta.totalPages ?? 0;

  let nextPage = currentPage;
  if (action === "first") {
    nextPage = 1;
  } else if (action === "prev") {
    nextPage = Math.max(1, currentPage - 1);
  } else if (action === "next") {
    nextPage = totalPages === 0 ? currentPage + 1 : Math.min(totalPages, currentPage + 1);
  } else if (action === "last") {
    nextPage = totalPages === 0 ? currentPage : totalPages;
  }

  if (nextPage < 1) nextPage = 1;
  if (totalPages > 0 && nextPage > totalPages) nextPage = totalPages;
  if (nextPage !== currentPage) {
    fetchAndRender({ page: nextPage });
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatNumber(value, formatter) {
  if (value === undefined || value === null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return (formatter ?? new Intl.NumberFormat("ko-KR")).format(num);
}

function td(content, { align, empty = false } = {}) {
  const classes = [];
  if (align) classes.push(`text-${align}`);
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  const emptyAttr = empty ? ' data-empty="true"' : "";
  return `<td${classAttr}${emptyAttr}>${content}</td>`;
}

function openNewDialog() {
  const dialog = $("#newExportDialog");
  const form = $("#newExportForm");
  if (!dialog || !form) return;

  form.reset();

  const steps = $$(".step", form);
  const totalSteps = steps.length;
  let currentStep = 0;

  const stepIndicator = $("#newExportStep");
  const stepTitle = $("#newExportSection");
  const nextButton = form.querySelector("[data-step-next]");
  const saveButton = form.querySelector("[data-step-save]");
  const completeButton = form.querySelector("[data-step-complete]");
  const cancelButton = form.querySelector("[data-dialog-cancel]");

  const showStep = (index) => {
    currentStep = Math.max(0, Math.min(index, totalSteps - 1));
    steps.forEach((stepEl, idx) => {
      if (idx === currentStep) {
        stepEl.removeAttribute("hidden");
      } else {
        stepEl.setAttribute("hidden", "true");
      }
    });
    if (stepIndicator) {
      stepIndicator.textContent = `${currentStep + 1} / ${totalSteps}`;
    }
    if (stepTitle) {
      const active = steps[currentStep];
      stepTitle.textContent = active?.dataset.stepTitle ?? "";
    }
    if (nextButton) {
      nextButton.disabled = currentStep >= totalSteps - 1;
    }
    if (completeButton) {
      completeButton.disabled = currentStep !== totalSteps - 1;
    }
  };

  const validateStep = (index) => {
    const stepEl = steps[index];
    if (!stepEl) return true;
    const inputs = $$("input, select, textarea", stepEl);
    for (const input of inputs) {
      if (typeof input.reportValidity === "function" && !input.reportValidity()) {
        input.focus();
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps - 1) {
      showStep(currentStep + 1);
    }
  };

  const handleSaveDraft = () => {
    if (!formHasInput(form)) {
      alert("입력된 내용이 없습니다.");
      return;
    }
    const values = collectFormValues(form);
    addDraftEntry(values);
    dialog.close();
  };

  const handleCancel = () => {
    const needConfirm = currentStep > 0 || formHasInput(form);
    if (!needConfirm || window.confirm("정말로 취소하시겠습니까?")) {
      form.reset();
      dialog.close();
    }
  };

  if (nextButton) {
    nextButton.onclick = handleNext;
  }
  if (saveButton) {
    saveButton.onclick = handleSaveDraft;
  }
  if (cancelButton) {
    cancelButton.onclick = handleCancel;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (currentStep !== totalSteps - 1) {
      if (validateStep(currentStep)) {
        handleNext();
      }
      return;
    }
    if (!form.reportValidity()) return;

    const values = collectFormValues(form);
    const payload = mapFormDataToPayload(values);

    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("등록 실패");
      await res.json();
      dialog.close();
      form.reset();
      if (location.pathname === "/export") {
        fetchAndRender({ page: 1 });
      }
    } catch (err) {
      alert(err.message || "등록 중 오류");
    }
  };

  dialog.showModal();
  showStep(currentStep);
}

/* Router */
function navigate(pathname) {
  setMenuOpen(false);
  if (location.pathname === pathname) return;
  window.history.pushState({}, "", pathname);
  render(pathname);
}
function render(pathname = location.pathname) {
  setMenuOpen(false);
  const handler = routes[pathname];
  if (handler) {
    handler();
  } else {
    renderNotFound();
  }
}
function renderNotFound() {
  setTopbarActive("");
  document.title = "404";
  app.innerHTML = `<section class="card"><h2>404</h2><p>페이지를 찾을 수 없습니다.</p></section>`;
  app.focus();
}

/* Delegated navigation */
window.addEventListener("click", (e) => {
  const link = e.target.closest("[data-link]");
  if (!link) return;
  const href = link.getAttribute("href") || link.dataset.link;
  if (!href) return;
  e.preventDefault();
  navigate(href);
});
window.addEventListener("popstate", () => render());

/* Utils */
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}

// 초기화
$("#year").textContent = new Date().getFullYear();
render(location.pathname || "/");
