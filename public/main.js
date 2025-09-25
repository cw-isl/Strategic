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
let selectionHandlersInitialized = false;

const toFlagEmoji = (countryCode = "") => {
  if (typeof countryCode !== "string" || countryCode.length !== 2) return "🏳";
  const upper = countryCode.toUpperCase();
  const codePoints = [...upper].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const COUNTRY_DATA = [
  { ko: "대한민국", en: "South Korea", iso2: "KR", dialCode: "+82" },
  { ko: "미국", en: "United States", iso2: "US", dialCode: "+1" },
  { ko: "일본", en: "Japan", iso2: "JP", dialCode: "+81" },
  { ko: "중국", en: "China", iso2: "CN", dialCode: "+86" },
  { ko: "캐나다", en: "Canada", iso2: "CA", dialCode: "+1" },
  { ko: "멕시코", en: "Mexico", iso2: "MX", dialCode: "+52" },
  { ko: "브라질", en: "Brazil", iso2: "BR", dialCode: "+55" },
  { ko: "아르헨티나", en: "Argentina", iso2: "AR", dialCode: "+54" },
  { ko: "칠레", en: "Chile", iso2: "CL", dialCode: "+56" },
  { ko: "페루", en: "Peru", iso2: "PE", dialCode: "+51" },
  { ko: "콜롬비아", en: "Colombia", iso2: "CO", dialCode: "+57" },
  { ko: "영국", en: "United Kingdom", iso2: "GB", dialCode: "+44" },
  { ko: "프랑스", en: "France", iso2: "FR", dialCode: "+33" },
  { ko: "이탈리아", en: "Italy", iso2: "IT", dialCode: "+39" },
  { ko: "스페인", en: "Spain", iso2: "ES", dialCode: "+34" },
  { ko: "독일", en: "Germany", iso2: "DE", dialCode: "+49" },
  { ko: "네덜란드", en: "Netherlands", iso2: "NL", dialCode: "+31" },
  { ko: "벨기에", en: "Belgium", iso2: "BE", dialCode: "+32" },
  { ko: "룩셈부르크", en: "Luxembourg", iso2: "LU", dialCode: "+352" },
  { ko: "스위스", en: "Switzerland", iso2: "CH", dialCode: "+41" },
  { ko: "오스트리아", en: "Austria", iso2: "AT", dialCode: "+43" },
  { ko: "덴마크", en: "Denmark", iso2: "DK", dialCode: "+45" },
  { ko: "스웨덴", en: "Sweden", iso2: "SE", dialCode: "+46" },
  { ko: "노르웨이", en: "Norway", iso2: "NO", dialCode: "+47" },
  { ko: "핀란드", en: "Finland", iso2: "FI", dialCode: "+358" },
  { ko: "포르투갈", en: "Portugal", iso2: "PT", dialCode: "+351" },
  { ko: "그리스", en: "Greece", iso2: "GR", dialCode: "+30" },
  { ko: "체코", en: "Czechia", iso2: "CZ", dialCode: "+420" },
  { ko: "헝가리", en: "Hungary", iso2: "HU", dialCode: "+36" },
  { ko: "폴란드", en: "Poland", iso2: "PL", dialCode: "+48" },
  { ko: "루마니아", en: "Romania", iso2: "RO", dialCode: "+40" },
  { ko: "불가리아", en: "Bulgaria", iso2: "BG", dialCode: "+359" },
  { ko: "슬로바키아", en: "Slovakia", iso2: "SK", dialCode: "+421" },
  { ko: "슬로베니아", en: "Slovenia", iso2: "SI", dialCode: "+386" },
  { ko: "크로아티아", en: "Croatia", iso2: "HR", dialCode: "+385" },
  { ko: "라트비아", en: "Latvia", iso2: "LV", dialCode: "+371" },
  { ko: "리투아니아", en: "Lithuania", iso2: "LT", dialCode: "+370" },
  { ko: "에스토니아", en: "Estonia", iso2: "EE", dialCode: "+372" },
  { ko: "아일랜드", en: "Ireland", iso2: "IE", dialCode: "+353" },
  { ko: "아이슬란드", en: "Iceland", iso2: "IS", dialCode: "+354" },
  { ko: "우크라이나", en: "Ukraine", iso2: "UA", dialCode: "+380" },
  { ko: "러시아", en: "Russia", iso2: "RU", dialCode: "+7" },
  { ko: "터키", en: "Turkey", iso2: "TR", dialCode: "+90" },
  { ko: "이스라엘", en: "Israel", iso2: "IL", dialCode: "+972" },
  { ko: "아랍에미리트", en: "United Arab Emirates", iso2: "AE", dialCode: "+971" },
  { ko: "사우디아라비아", en: "Saudi Arabia", iso2: "SA", dialCode: "+966" },
  { ko: "카타르", en: "Qatar", iso2: "QA", dialCode: "+974" },
  { ko: "쿠웨이트", en: "Kuwait", iso2: "KW", dialCode: "+965" },
  { ko: "바레인", en: "Bahrain", iso2: "BH", dialCode: "+973" },
  { ko: "오만", en: "Oman", iso2: "OM", dialCode: "+968" },
  { ko: "요르단", en: "Jordan", iso2: "JO", dialCode: "+962" },
  { ko: "이집트", en: "Egypt", iso2: "EG", dialCode: "+20" },
  { ko: "이란", en: "Iran", iso2: "IR", dialCode: "+98" },
  { ko: "이라크", en: "Iraq", iso2: "IQ", dialCode: "+964" },
  { ko: "파키스탄", en: "Pakistan", iso2: "PK", dialCode: "+92" },
  { ko: "방글라데시", en: "Bangladesh", iso2: "BD", dialCode: "+880" },
  { ko: "인도", en: "India", iso2: "IN", dialCode: "+91" },
  { ko: "스리랑카", en: "Sri Lanka", iso2: "LK", dialCode: "+94" },
  { ko: "네팔", en: "Nepal", iso2: "NP", dialCode: "+977" },
  { ko: "몽골", en: "Mongolia", iso2: "MN", dialCode: "+976" },
  { ko: "카자흐스탄", en: "Kazakhstan", iso2: "KZ", dialCode: "+7" },
  { ko: "우즈베키스탄", en: "Uzbekistan", iso2: "UZ", dialCode: "+998" },
  { ko: "베트남", en: "Vietnam", iso2: "VN", dialCode: "+84" },
  { ko: "태국", en: "Thailand", iso2: "TH", dialCode: "+66" },
  { ko: "말레이시아", en: "Malaysia", iso2: "MY", dialCode: "+60" },
  { ko: "싱가포르", en: "Singapore", iso2: "SG", dialCode: "+65" },
  { ko: "인도네시아", en: "Indonesia", iso2: "ID", dialCode: "+62" },
  { ko: "필리핀", en: "Philippines", iso2: "PH", dialCode: "+63" },
  { ko: "캄보디아", en: "Cambodia", iso2: "KH", dialCode: "+855" },
  { ko: "라오스", en: "Laos", iso2: "LA", dialCode: "+856" },
  { ko: "미얀마", en: "Myanmar", iso2: "MM", dialCode: "+95" },
  { ko: "브루나이", en: "Brunei", iso2: "BN", dialCode: "+673" },
  { ko: "홍콩", en: "Hong Kong", iso2: "HK", dialCode: "+852" },
  { ko: "마카오", en: "Macau", iso2: "MO", dialCode: "+853" },
  { ko: "대만", en: "Taiwan", iso2: "TW", dialCode: "+886" },
  { ko: "호주", en: "Australia", iso2: "AU", dialCode: "+61" },
  { ko: "뉴질랜드", en: "New Zealand", iso2: "NZ", dialCode: "+64" },
  { ko: "사모아", en: "Samoa", iso2: "WS", dialCode: "+685" },
  { ko: "피지", en: "Fiji", iso2: "FJ", dialCode: "+679" },
  { ko: "파푸아뉴기니", en: "Papua New Guinea", iso2: "PG", dialCode: "+675" },
  { ko: "남아프리카공화국", en: "South Africa", iso2: "ZA", dialCode: "+27" },
  { ko: "나이지리아", en: "Nigeria", iso2: "NG", dialCode: "+234" },
  { ko: "케냐", en: "Kenya", iso2: "KE", dialCode: "+254" },
  { ko: "모로코", en: "Morocco", iso2: "MA", dialCode: "+212" },
  { ko: "알제리", en: "Algeria", iso2: "DZ", dialCode: "+213" },
  { ko: "튀니지", en: "Tunisia", iso2: "TN", dialCode: "+216" },
  { ko: "에티오피아", en: "Ethiopia", iso2: "ET", dialCode: "+251" },
  { ko: "가나", en: "Ghana", iso2: "GH", dialCode: "+233" },
  { ko: "탄자니아", en: "Tanzania", iso2: "TZ", dialCode: "+255" },
  { ko: "앙골라", en: "Angola", iso2: "AO", dialCode: "+244" },
  { ko: "짐바브웨", en: "Zimbabwe", iso2: "ZW", dialCode: "+263" },
  { ko: "우간다", en: "Uganda", iso2: "UG", dialCode: "+256" },
  { ko: "보츠와나", en: "Botswana", iso2: "BW", dialCode: "+267" },
  { ko: "잠비아", en: "Zambia", iso2: "ZM", dialCode: "+260" },
  { ko: "세네갈", en: "Senegal", iso2: "SN", dialCode: "+221" },
  { ko: "코트디부아르", en: "Ivory Coast", iso2: "CI", dialCode: "+225" },
  { ko: "카메룬", en: "Cameroon", iso2: "CM", dialCode: "+237" },
  { ko: "수단", en: "Sudan", iso2: "SD", dialCode: "+249" },
  { ko: "카보베르데", en: "Cape Verde", iso2: "CV", dialCode: "+238" },
  { ko: "마다가스카르", en: "Madagascar", iso2: "MG", dialCode: "+261" },
  { ko: "모리셔스", en: "Mauritius", iso2: "MU", dialCode: "+230" },
  { ko: "트리니다드토바고", en: "Trinidad and Tobago", iso2: "TT", dialCode: "+1" },
  { ko: "쿠바", en: "Cuba", iso2: "CU", dialCode: "+53" },
  { ko: "도미니카공화국", en: "Dominican Republic", iso2: "DO", dialCode: "+1" },
  { ko: "자메이카", en: "Jamaica", iso2: "JM", dialCode: "+1" },
  { ko: "파나마", en: "Panama", iso2: "PA", dialCode: "+507" },
  { ko: "코스타리카", en: "Costa Rica", iso2: "CR", dialCode: "+506" },
  { ko: "파라과이", en: "Paraguay", iso2: "PY", dialCode: "+595" },
  { ko: "우루과이", en: "Uruguay", iso2: "UY", dialCode: "+598" },
  { ko: "볼리비아", en: "Bolivia", iso2: "BO", dialCode: "+591" },
  { ko: "베네수엘라", en: "Venezuela", iso2: "VE", dialCode: "+58" }
];

const COUNTRY_LIST = COUNTRY_DATA.map((item) => {
  const iso2 = item.iso2.toUpperCase();
  const dial = item.dialCode.startsWith("+") ? item.dialCode : `+${item.dialCode}`;
  const searchValue = [item.ko, item.en, iso2, dial, dial.replace(/[+\s-]/g, ""), item.ko.replace(/\s/g, ""), item.en.replace(/\s/g, "")]
    .join(" ")
    .toLowerCase();
  return {
    name: item.ko,
    english: item.en,
    iso2,
    dialCode: dial,
    flag: toFlagEmoji(iso2),
    searchValue,
  };
}).sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

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
        <button id="continueBtn" class="btn" type="button" hidden>이어서 등록하기</button>
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
  const continueButton = $("#continueBtn");
  if (continueButton) {
    continueButton.hidden = true;
    continueButton.addEventListener("click", () => {
      const selectedIds = getSelectedDraftRowIds();
      if (!selectedIds.length) return;
      // 추후 실제 데이터 연동 시 선택한 임시저장 건을 불러오도록 연결
      openNewDialog();
    });
  }
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

    const combinedRows = getCombinedRows(lastFetchedItems);
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
    updateContinueButtonVisibility();
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
      const statusRaw = row.status ? String(row.status) : "";
      const status = statusRaw ? escapeHtml(statusRaw) : "-";
      const note = row.note ? escapeHtml(String(row.note)) : "-";
      const plStatus = docValue(row.plStatus);
      const invoiceStatus = docValue(row.invoiceStatus);
      const permitStatus = docValue(row.permitStatus);
      const declarationStatus = docValue(row.declarationStatus);
      const usageStatus = docValue(row.usageStatus);
      const blStatus = docValue(row.blStatus);
      const fileNote = docValue(row.fileNote);
      const statusNormalized = statusRaw.replace(/\s+/g, "");
      const isDraftStatus = Boolean(row.isDraft) || statusNormalized.includes("임시저장");
      const rowIdentifier = row.id ?? row._id ?? row.seq ?? row.projectCode ?? row.contractNumber ?? row.client ?? `row-${startIndex + idx}`;
      const selectBox = `<input type="checkbox" data-select data-entry-id="${escapeHtml(String(rowIdentifier))}" data-draft="${isDraftStatus ? "true" : "false"}" aria-label="선택" />`;
      const rowAttrs = isDraftStatus ? " data-draft=\"true\"" : row.isDraft ? " data-draft=\"true\"" : "";

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

  ensureSelectionHandlers();
  updateContinueButtonVisibility();
}

function ensureSelectionHandlers() {
  if (selectionHandlersInitialized) return;
  const tbody = $("#tbody");
  if (!tbody) return;
  tbody.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox" || !target.hasAttribute("data-select")) return;
    updateContinueButtonVisibility();
  });
  selectionHandlersInitialized = true;
}

function getSelectedDraftRowIds() {
  const tbody = $("#tbody");
  if (!tbody) return [];
  return $$('input[type="checkbox"][data-select][data-draft="true"]:checked', tbody)
    .map((input) => input.dataset.entryId)
    .filter(Boolean);
}

function updateContinueButtonVisibility() {
  const continueButton = $("#continueBtn");
  if (!continueButton) return;
  const hasDraftSelection = getSelectedDraftRowIds().length > 0;
  continueButton.hidden = !hasDraftSelection;
}

function getCombinedRows(serverRows = []) {
  return serverRows;
}

function updateMeta() {
  const serverTotal = lastServerMeta.totalCount ?? 0;
  const serverPages = lastServerMeta.totalPages ?? 0;
  const totalPages = serverTotal === 0 ? 0 : serverPages === 0 ? 1 : serverPages;
  lastMeta = {
    totalPages,
    totalCount: serverTotal,
    pageSize: lastServerMeta.pageSize ?? PAGE_SIZE,
  };
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
  const exportType = trim(data.exportType);
  const exportTypeDetail = trim(data.exportTypeDetail);
  const projectName = trim(data.projectName);
  const projectCode = trim(data.projectCode);
  const strategicFlag = trim(data.strategicFlag);
  const managerName = trim(data.managerName);
  const managerDepartment = trim(data.managerDepartment);
  const managerPhone = trim(data.managerPhone);
  const managerEmail = trim(data.managerEmail);
  const importCompanyName = trim(data.importCompanyName);
  const importAddress = trim(data.importAddress);
  const importCountry = trim(data.importCountry);
  const importCountryCode = trim(data.importCountryCode);
  const importPhone = trim(data.importPhone);
  const importContactName = trim(data.importContactName);
  const importContactPhone = trim(data.importContactPhone);
  const importEmail = trim(data.importEmail);
  const importEtc = trim(data.importEtc);

  const resolvedPurpose = exportType === "기타" && exportTypeDetail ? exportTypeDetail : exportType;

  const payload = {
    exportType,
    exportTypeDetail: exportType === "기타" ? exportTypeDetail : "",
    projectName,
    projectCode,
    strategicFlag,
    managerName,
    managerDepartment,
    managerPhone,
    managerEmail,
    importCompanyName,
    importAddress,
    importCountry,
    importCountryCode,
    importPhone,
    importContactName,
    importContactPhone,
    importEmail,
    importEtc,
    requester: {
      name: managerName,
      department: managerDepartment,
      phone: managerPhone,
      email: managerEmail,
    },
    importer: {
      companyName: importCompanyName,
      address: importAddress,
      country: importCountry,
      countryCode: importCountryCode,
      phone: importPhone,
      contactName: importContactName,
      contactPhone: importContactPhone,
      email: importEmail,
      etc: importEtc,
    },
    shipmentType: exportType,
    shipmentPurpose: resolvedPurpose,
    projectNameDisplay: projectName,
    projectCodeDisplay: projectCode,
    department: managerDepartment,
    manager: managerName,
    managerEmail,
    contactPhone: managerPhone,
    client: importCompanyName,
    clientCountry: importCountry,
    clientManager: importContactName,
    note: importEtc,
    country: importCountry,
    status: "대기",
  };
  return payload;
}

function mapFormDataToRow(data = {}, { draft = false } = {}) {
  const payload = mapFormDataToPayload(data);
  const row = {
    ...payload,
    createdAt: Date.now(),
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
  const prevButton = form.querySelector("[data-step-prev]");
  const nextButton = form.querySelector("[data-step-next]");
  const saveButton = form.querySelector("[data-step-save]");
  const completeButton = form.querySelector("[data-step-complete]");
  const cancelButton = form.querySelector("[data-dialog-cancel]");

  const exportTypeSelect = form.querySelector("select[name=exportType]");
  const exportTypeDetailLabel = form.querySelector("[data-export-type-detail]");
  const exportTypeDetailInput = form.querySelector("input[name=exportTypeDetail]");
  const strategicGroup = form.querySelector("[data-required-group]");
  const strategicValueInput = form.querySelector("[data-strategic-value]");
  const strategicOptions = strategicGroup
    ? $$('input[type="checkbox"][data-strategic-option]', strategicGroup)
    : [];
  const countrySelectContainer = form.querySelector("[data-country-select]");

  const isStepComplete = (index) => {
    const stepEl = steps[index];
    if (!stepEl) return true;

    const requiredInputs = $$('[required]', stepEl);
    for (const input of requiredInputs) {
      if (input.disabled) continue;
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
        if (input.type === "checkbox" || input.type === "radio") {
          if (!input.checked) return false;
        } else if (!input.checkValidity() || (input.value ?? "").trim() === "") {
          return false;
        }
      }
    }

    const requiredGroups = $$('[data-required-group]', stepEl);
    for (const group of requiredGroups) {
      const options = $$('input[type="checkbox"]', group).filter((opt) => !opt.disabled);
      if (!options.some((opt) => opt.checked)) {
        return false;
      }
    }

    const hiddenRequired = $$('[data-required-hidden]', stepEl);
    for (const hidden of hiddenRequired) {
      if (hidden instanceof HTMLInputElement || hidden instanceof HTMLTextAreaElement) {
        if ((hidden.value ?? "").trim() === "") {
          return false;
        }
      }
    }

    return true;
  };

  const updateStepActionState = () => {
    const complete = isStepComplete(currentStep);
    if (prevButton) {
      prevButton.disabled = currentStep === 0;
    }
    if (nextButton) {
      nextButton.disabled = currentStep >= totalSteps - 1 || !complete;
    }
    if (completeButton) {
      completeButton.disabled = currentStep !== totalSteps - 1 || !complete;
    }
  };

  const toggleExportTypeDetail = () => {
    const needDetail = exportTypeSelect?.value === "기타";
    if (exportTypeDetailLabel) {
      if (needDetail) {
        exportTypeDetailLabel.removeAttribute("hidden");
      } else {
        exportTypeDetailLabel.setAttribute("hidden", "true");
      }
    }
    if (exportTypeDetailInput) {
      exportTypeDetailInput.disabled = !needDetail;
      exportTypeDetailInput.required = Boolean(needDetail);
      if (!needDetail) {
        exportTypeDetailInput.value = "";
      }
    }
    updateStepActionState();
  };

  const handleStrategicOptionChange = (input) => {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.checked) {
      strategicOptions.forEach((opt) => {
        if (opt !== input) opt.checked = false;
      });
      if (strategicValueInput) {
        strategicValueInput.value = input.value;
      }
    } else {
      const selected = strategicOptions.find((opt) => opt.checked);
      if (strategicValueInput) {
        strategicValueInput.value = selected ? selected.value : "";
      }
    }
    updateStepActionState();
  };

  const setupStrategicGroup = () => {
    if (!strategicGroup) return;
    if (strategicValueInput) strategicValueInput.value = "";
    strategicOptions.forEach((option) => {
      option.checked = false;
      if (!option.dataset.boundStrategic) {
        option.addEventListener("change", (event) => {
          if (event.target instanceof HTMLInputElement) {
            handleStrategicOptionChange(event.target);
          }
        });
        option.dataset.boundStrategic = "true";
      }
    });
  };

  const setupCountrySelector = () => {
    if (!countrySelectContainer) return;
    const toggle = countrySelectContainer.querySelector("[data-country-toggle]");
    const menu = countrySelectContainer.querySelector("[data-country-menu]");
    const optionsList = countrySelectContainer.querySelector("[data-country-options]");
    const searchInput = countrySelectContainer.querySelector("[data-country-search]");
    const hiddenInput = countrySelectContainer.querySelector("[data-country-value]");
    const flagEl = countrySelectContainer.querySelector("[data-country-flag]");
    const labelEl = countrySelectContainer.querySelector("[data-country-label]");
    const dialEl = countrySelectContainer.querySelector("[data-country-selected-dial]");
    const codeInput = form.querySelector("[data-country-code]");

    if (!(toggle instanceof HTMLButtonElement) || !menu || !optionsList || !(hiddenInput instanceof HTMLInputElement)) {
      return;
    }

    const container = countrySelectContainer;
    const DEFAULT_LABEL = "국가를 선택하세요";
    const DEFAULT_FLAG = "🌐";

    const renderOptions = (items) => {
      if (!(optionsList instanceof HTMLElement)) return;
      if (!Array.isArray(items) || items.length === 0) {
        optionsList.innerHTML = '<li class="country-empty">검색 결과가 없습니다.</li>';
        return;
      }
      optionsList.innerHTML = items
        .map((country) => {
          const selected = hiddenInput.value === country.name;
          const selectedAttr = selected ? ' data-selected="true" aria-selected="true"' : ' aria-selected="false"';
          return `
            <li>
              <button type="button" class="country-option" role="option"${selectedAttr} data-country-option data-country-name="${escapeHtml(
                country.name
              )}" data-country-dial="${escapeHtml(country.dialCode)}" data-country-iso="${escapeHtml(country.iso2)}">
                <span class="country-flag">${escapeHtml(country.flag)}</span>
                <span class="country-info">
                  <span class="country-name">${escapeHtml(country.name)}</span>
                  <span class="country-en">${escapeHtml(country.english)}</span>
                </span>
                <span class="country-dial">${escapeHtml(country.dialCode)}</span>
              </button>
            </li>
          `;
        })
        .join("");
    };

    const filterOptions = (keyword = "") => {
      const value = keyword.trim().toLowerCase();
      const filtered = value
        ? COUNTRY_LIST.filter((country) => country.searchValue.includes(value))
        : COUNTRY_LIST.slice();
      renderOptions(filtered);
    };

    const closeMenu = () => {
      if (menu.hasAttribute("hidden")) return;
      menu.setAttribute("hidden", "true");
      container.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      if (searchInput instanceof HTMLInputElement) {
        searchInput.value = "";
      }
      filterOptions("");
    };

    const openMenu = () => {
      if (!menu.hasAttribute("hidden")) return;
      menu.removeAttribute("hidden");
      container.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      if (searchInput instanceof HTMLInputElement) {
        searchInput.value = "";
      }
      filterOptions("");
      window.requestAnimationFrame(() => {
        if (searchInput instanceof HTMLInputElement) {
          searchInput.focus();
        }
      });
    };

    const resetSelection = ({ silent } = {}) => {
      if (flagEl) flagEl.textContent = DEFAULT_FLAG;
      if (labelEl) labelEl.textContent = DEFAULT_LABEL;
      if (dialEl) dialEl.textContent = "";
      toggle.setAttribute("data-placeholder", "true");
      hiddenInput.value = "";
      if (codeInput instanceof HTMLInputElement) {
        codeInput.value = "";
      }
      if (!silent) {
        updateStepActionState();
      }
    };

    const selectCountry = (country, { silent } = {}) => {
      if (!country) return;
      if (flagEl) flagEl.textContent = country.flag;
      if (labelEl) labelEl.textContent = country.name;
      if (dialEl) dialEl.textContent = `${country.dialCode} · ${country.english}`;
      toggle.setAttribute("data-placeholder", "false");
      hiddenInput.value = country.name;
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (codeInput instanceof HTMLInputElement) {
        codeInput.value = country.dialCode;
      }
      if (!silent) {
        updateStepActionState();
      }
    };

    resetSelection({ silent: true });
    filterOptions("");

    if (!container.dataset.boundCountry) {
      const handleDocumentClick = (event) => {
        if (!container.classList.contains("open")) return;
        if (container.contains(event.target)) return;
        closeMenu();
      };

      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        if (container.classList.contains("open")) {
          closeMenu();
        } else {
          openMenu();
        }
      });

      toggle.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMenu();
        } else if (event.key === "Escape") {
          closeMenu();
        }
      });

      if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener("input", (event) => {
          filterOptions(event.target.value || "");
        });
        searchInput.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            const firstOption = optionsList.querySelector("[data-country-option]");
            if (firstOption instanceof HTMLElement) {
              firstOption.focus();
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
            toggle.focus();
          } else if (event.key === "Enter") {
            event.preventDefault();
          }
        });
      }

      const focusOption = (base, direction) => {
        const buttons = [...optionsList.querySelectorAll("[data-country-option]")];
        if (!buttons.length) return;
        if (direction === "first") {
          buttons[0].focus();
          return;
        }
        if (direction === "last") {
          buttons[buttons.length - 1].focus();
          return;
        }
        const currentIndex = base ? buttons.indexOf(base) : -1;
        const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : buttons.length - 1) : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
        buttons[nextIndex].focus();
      };

      optionsList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-country-option]");
        if (!button) return;
        const iso = button.dataset.countryIso;
        const name = button.dataset.countryName;
        const dial = button.dataset.countryDial;
        const country = COUNTRY_LIST.find((item) => item.iso2 === iso && item.dialCode === dial && item.name === name) ||
          COUNTRY_LIST.find((item) => item.iso2 === iso) ||
          COUNTRY_LIST.find((item) => item.name === name);
        if (country) {
          selectCountry(country);
          closeMenu();
          toggle.focus();
        }
      });

      optionsList.addEventListener("keydown", (event) => {
        const option = event.target.closest("[data-country-option]");
        if (!option) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusOption(option, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusOption(option, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusOption(option, "first");
        } else if (event.key === "End") {
          event.preventDefault();
          focusOption(option, "last");
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
          toggle.focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          option.click();
        }
      });

      document.addEventListener("click", handleDocumentClick);

      form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
          resetSelection({ silent: true });
          closeMenu();
          updateStepActionState();
        });
      });

      container.dataset.boundCountry = "true";
    } else {
      resetSelection({ silent: true });
      closeMenu();
      filterOptions("");
    }
  };

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
    updateStepActionState();
  };

  const validateStep = (index) => {
    const stepEl = steps[index];
    if (!stepEl) return true;
    const requiredGroups = $$('[data-required-group]', stepEl);
    for (const group of requiredGroups) {
      const options = $$('input[type="checkbox"]', group).filter((opt) => !opt.disabled);
      if (!options.some((opt) => opt.checked)) {
        alert("전략물자 여부를 선택해주세요.");
        options[0]?.focus();
        return false;
      }
    }
    const hiddenRequired = $$('[data-required-hidden]', stepEl);
    for (const hidden of hiddenRequired) {
      if (hidden instanceof HTMLInputElement || hidden instanceof HTMLTextAreaElement) {
        if ((hidden.value ?? "").trim() === "") {
          const message = hidden.dataset.requiredMessage || "필수 항목을 선택해주세요.";
          alert(message);
          const focusSelector = hidden.dataset.targetSelector;
          const target = focusSelector ? stepEl.querySelector(focusSelector) : null;
          if (target instanceof HTMLElement) {
            target.focus();
          }
          return false;
        }
      }
    }
    const inputs = $$("input, select, textarea", stepEl);
    for (const input of inputs) {
      if (input.disabled) continue;
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

  const handlePrev = () => {
    if (currentStep > 0) {
      showStep(currentStep - 1);
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
  if (prevButton) {
    prevButton.onclick = handlePrev;
  }
  if (saveButton) {
    saveButton.onclick = handleSaveDraft;
  }
  if (cancelButton) {
    cancelButton.onclick = handleCancel;
  }

  if (!form.dataset.boundStepState) {
    form.addEventListener("input", () => updateStepActionState());
    form.addEventListener("change", () => updateStepActionState());
    form.dataset.boundStepState = "true";
  }

  if (exportTypeSelect && !exportTypeSelect.dataset.boundDetail) {
    exportTypeSelect.addEventListener("change", toggleExportTypeDetail);
    exportTypeSelect.dataset.boundDetail = "true";
  }

  setupStrategicGroup();
  setupCountrySelector();
  toggleExportTypeDetail();

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
