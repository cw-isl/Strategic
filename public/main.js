// 작은 라우터 + API 연동 + 모달 신규등록

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

const PAGE_SIZE = 20;
const EXPORT_TABLE_COLSPAN = 23;
let currentPage = 1;
let currentQuery = "";
let lastMeta = { totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE };
let lastServerMeta = { totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE };
let lastFetchedItems = [];
let lastCombinedRows = [];
let lastFilteredCount = 0;
const draftEntries = [];
let draftSeq = -1;
let selectionHandlersInitialized = false;
const INVOICE_FILTER_ALL = "all";
const INVOICE_FILTER_MISSING_ITEMS = "missing-items";
const INVOICE_FILTER_NO_CODE = "no-code";
let currentInvoiceFilter = INVOICE_FILTER_ALL;

const EXPORT_TYPE_INVOICE_CODES = {
  정상판매: { code: "SEA", label: "정상판매" },
  "A/S": { code: "SEE", label: "A/S" },
  BMT: { code: "SED", label: "BMT" },
  장애교체: { code: "SEC", label: "장애교체" },
  TEST: { code: "SEB", label: "TEST" },
  Stock: { code: "SEB", label: "Stock" },
  임대: { code: "SEB", label: "임대" },
  유상임대: { code: "SEB", label: "유상임대" },
  "기타 장애교체": { code: "SEC", label: "기타 장애교체" },
  "기타 A/S": { code: "SEE", label: "기타 A/S" },
  제조사샘플: { code: "SED", label: "제조사샘플" },
  개발용샘플: { code: "SED", label: "개발용샘플" },
  기타: { code: "SET", label: "기타" },
};

function parsePositiveInteger(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  const int = Math.floor(num);
  if (int <= 0) return null;
  return int;
}

function formatInvoiceDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const eightDigit = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (eightDigit) {
      const year = Number(eightDigit[1]);
      const month = Number(eightDigit[2]);
      const day = Number(eightDigit[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
      }
    }
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function resolveExistingInvoiceNumber(row = {}) {
  if (!row || typeof row !== "object") return "";
  const candidates = [
    row.invoiceNumber,
    row.invoiceNo,
    row.invoice_no,
    row.invoice_number,
    row.invoiceNumberFull,
    row.invoice_number_full,
    row._computedInvoiceNumber,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }
  return "";
}

function extractSequenceFromInvoiceNumber(invoiceNumber) {
  if (typeof invoiceNumber !== "string") return null;
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^[A-Z]{2,}\d{8}_(\d{2,})$/i);
  if (!match) return null;
  return parsePositiveInteger(match[1]);
}

function formatInvoiceNumber({ code, date, sequence, existingNumber } = {}) {
  const existing = typeof existingNumber === "string" ? existingNumber.trim() : "";
  if (existing && /^[A-Z]{2,}\d{8}_(\d{2,})$/i.test(existing)) {
    return existing.toUpperCase();
  }
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalizedCode) return "";
  const dateKey = formatInvoiceDateKey(date);
  let resolvedSeq = parsePositiveInteger(sequence);
  if (!resolvedSeq && existing) {
    resolvedSeq = extractSequenceFromInvoiceNumber(existing);
  }
  const seqPart = resolvedSeq ? String(resolvedSeq).padStart(2, "0") : "";
  if (!dateKey && !seqPart) {
    return normalizedCode;
  }
  if (!seqPart) {
    return `${normalizedCode}${dateKey}`;
  }
  if (!dateKey) {
    return `${normalizedCode}_${seqPart}`;
  }
  return `${normalizedCode}${dateKey}_${seqPart}`;
}

function resolveInvoiceDownloadKey(row = {}) {
  if (!row || typeof row !== "object") return "";
  const candidates = [
    row.id,
    row._id,
    row.invoiceNumber,
    row._computedInvoiceNumber,
    row.projectCode,
    row.contractNumber,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }
  return "";
}

function buildInvoiceDownloadUrl(row = {}) {
  const key = resolveInvoiceDownloadKey(row);
  if (!key) return "";
  return `/api/exports/${encodeURIComponent(key)}/invoice.pdf`;
}

function resolveInvoiceSequence(row = {}) {
  if (!row || typeof row !== "object") return null;
  const candidates = [
    row.invoiceSequence,
    row.invoice_sequence,
    row.invoiceSeq,
    row.invoice_seq,
    row.invoiceSequenceNumber,
    row.invoice_sequence_number,
    row.invoiceNumberSequence,
    row.invoice_number_sequence,
    row.invoiceSerial,
    row.invoice_serial,
    row.invoiceOrder,
    row.invoice_order,
    row._computedInvoiceSequence,
  ];
  for (const candidate of candidates) {
    const parsed = parsePositiveInteger(candidate);
    if (parsed) return parsed;
  }
  const fromNumber = extractSequenceFromInvoiceNumber(resolveExistingInvoiceNumber(row));
  if (fromNumber) return fromNumber;
  return null;
}

function resolveInvoiceDateValue(row = {}) {
  if (!row || typeof row !== "object") return null;
  return (
    row.dispatchDate ||
    row.shipmentDate ||
    (row.shipment && (row.shipment.dispatchDate || row.shipment.shipmentDate)) ||
    row.createdAt ||
    null
  );
}

function estimateNextInvoiceSequence(code, dateKey) {
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const normalizedDate = typeof dateKey === "string" ? dateKey.trim() : "";
  if (!normalizedCode || !normalizedDate) return null;
  let maxSeq = 0;
  for (const row of lastCombinedRows) {
    if (!row || typeof row !== "object") continue;
    const info = resolveInvoiceInfo(row);
    if (!info || !info.code || String(info.code).toUpperCase() !== normalizedCode) continue;
    const rowDateKey = formatInvoiceDateKey(resolveInvoiceDateValue(row));
    if (rowDateKey !== normalizedDate) continue;
    const seq = resolveInvoiceSequence(row);
    if (seq && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  if (maxSeq > 0) return maxSeq + 1;
  return 1;
}

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

function resolveCountryData(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const numeric = raw.replace(/[+\s-]/g, "");
  return (
    COUNTRY_LIST.find((country) =>
      country.name === raw ||
      country.english.toLowerCase() === normalized ||
      country.iso2 === raw.toUpperCase() ||
      country.dialCode === raw ||
      country.dialCode.replace(/[+\s-]/g, "") === numeric
    ) || null
  );
}

function resolveRowIdentifier(row, fallbackIndex) {
  if (!row || typeof row !== "object") {
    return typeof fallbackIndex === "number" ? `row-${fallbackIndex}` : "";
  }
  const candidates = [
    row._entryId,
    row.id,
    row._id,
    row.seq,
    row.projectCode,
    row.contractNumber,
    row.client,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }
  if (typeof fallbackIndex === "number") {
    return `row-${fallbackIndex}`;
  }
  if (row.createdAt !== undefined) {
    return `row-${row.createdAt}`;
  }
  return "";
}

function resolveResumeStep(meta, totalSteps) {
  const steps = Number.isFinite(totalSteps) && totalSteps > 0 ? Math.floor(totalSteps) : 0;
  if (!meta || typeof meta !== "object" || steps <= 0) {
    return 0;
  }
  const rawStep =
    meta.stepIndex ??
    (Number.isFinite(meta.resumeStep) ? meta.resumeStep : undefined) ??
    (Number.isFinite(meta.completedSteps) ? Number(meta.completedSteps) - 1 : undefined);
  if (!Number.isFinite(rawStep)) {
    return 0;
  }
  return Math.max(0, Math.min(steps - 1, Math.floor(rawStep)));
}

function mapRowToFormValues(row = {}) {
  const fields = {};
  const setField = (name, value, { boolean = false } = {}) => {
    if (boolean) {
      fields[name] = Boolean(value);
      return;
    }
    if (value === undefined || value === null) {
      fields[name] = "";
      return;
    }
    fields[name] = String(value);
  };
  const toStringOrEmpty = (value) => (value === undefined || value === null ? "" : String(value));
  const toNumberOrZero = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const exportType = row.exportType ?? row.shipmentTypeRaw ?? row.shipmentType ?? "";
  setField("exportType", exportType);
  const exportTypeDetail = row.exportTypeDetail ?? (exportType === "기타" ? row.shipmentPurpose ?? "" : "");
  setField("exportTypeDetail", exportTypeDetail);
  const invoiceInfo =
    resolveInvoiceInfo(row) ??
    resolveInvoiceCodeFromType(exportType, exportTypeDetail ?? row.shipmentPurpose ?? "");
  setField("invoiceCode", invoiceInfo?.code ?? "");
  setField("invoiceCodeLabel", invoiceInfo?.label ?? "");
  const invoiceNote = row.invoiceNote ?? invoiceInfo?.label ?? "";
  setField("exportNote", invoiceNote);
  const invoiceSequenceValue = resolveInvoiceSequence(row);
  setField("invoiceSequence", invoiceSequenceValue ?? "");
  const invoiceExistingNumber = resolveExistingInvoiceNumber(row);
  const invoiceNumberValue = formatInvoiceNumber({
    code: invoiceInfo?.code ?? "",
    date: resolveInvoiceDateValue(row),
    sequence: invoiceSequenceValue,
    existingNumber: invoiceExistingNumber,
  });
  setField("invoiceNumber", invoiceNumberValue);

  setField("projectName", row.projectName ?? row.projectNameDisplay ?? "");
  setField("projectCode", row.projectCode ?? row.projectCodeDisplay ?? "");

  const strategicFlag = row.strategicFlag ?? row.strategicClassification ?? "";
  setField("strategicFlag", strategicFlag);
  const strategicCertificate =
    row.strategicExpertCertificate ??
    row.strategicExpertCertificateId ??
    row.strategicExpertCertificateName ??
    "";
  setField("strategicExpertCertificate", strategicCertificate);

  const requester = row.requester || {};
  setField("managerName", row.managerName ?? requester.name ?? "");
  setField("managerDepartment", row.managerDepartment ?? requester.department ?? "");
  setField("managerPhone", row.managerPhone ?? requester.phone ?? "");
  setField("managerEmail", row.managerEmail ?? requester.email ?? "");

  const importer = row.importer || {};
  const importCountryData = resolveCountryData(
    row.importCountry ?? importer.country ?? row.clientCountry ?? ""
  );
  setField("importCompanyName", row.importCompanyName ?? importer.companyName ?? row.client ?? "");
  setField("importAddress", row.importAddress ?? importer.address ?? "");
  setField("importCountry", importCountryData?.name ?? (typeof row.importCountry === "string" ? row.importCountry.trim() : ""));
  setField(
    "importCountryCode",
    row.importCountryCode ?? importer.countryCode ?? importCountryData?.dialCode ?? ""
  );
  setField("importPhone", row.importPhone ?? importer.phone ?? "");
  setField("importContactName", row.importContactName ?? importer.contactName ?? row.clientManager ?? "");
  setField("importContactPhone", row.importContactPhone ?? importer.contactPhone ?? "");
  setField("importEmail", row.importEmail ?? importer.email ?? "");
  setField("importEtc", row.importEtc ?? importer.etc ?? row.note ?? "");

  const notifyParty = row.notifyParty || {};
  setField(
    "notifySameAsImporter",
    row.notifySameAsImporter ?? notifyParty.sameAsImporter ?? false,
    { boolean: true }
  );
  setField("notifyCompanyName", row.notifyCompanyName ?? notifyParty.companyName ?? "");
  setField("notifyAddress", row.notifyAddress ?? notifyParty.address ?? "");
  const notifyCountryData = resolveCountryData(row.notifyCountry ?? notifyParty.country ?? "");
  setField("notifyCountry", notifyCountryData?.name ?? (typeof row.notifyCountry === "string" ? row.notifyCountry.trim() : ""));
  setField(
    "notifyCountryCode",
    row.notifyCountryCode ?? notifyParty.countryCode ?? notifyCountryData?.dialCode ?? ""
  );
  setField("notifyPhone", row.notifyPhone ?? notifyParty.phone ?? "");
  setField("notifyContactName", row.notifyContactName ?? notifyParty.contactName ?? "");
  setField("notifyContactPhone", row.notifyContactPhone ?? notifyParty.contactPhone ?? "");
  setField("notifyEmail", row.notifyEmail ?? notifyParty.email ?? "");
  setField("notifyEtc", row.notifyEtc ?? notifyParty.etc ?? "");

  const originCountryData = resolveCountryData(row.originCountry ?? row.shipment?.originCountry ?? "");
  const destinationCountryData = resolveCountryData(
    row.destinationCountry ?? row.shipment?.destinationCountry ?? row.country ?? ""
  );
  setField(
    "originCountry",
    originCountryData?.name ?? (typeof row.originCountry === "string" ? row.originCountry.trim() : "")
  );
  setField(
    "destinationCountry",
    destinationCountryData?.name ??
      (typeof row.destinationCountry === "string" ? row.destinationCountry.trim() : "")
  );

  const dispatchDate = row.dispatchDate ?? row.shipment?.dispatchDate ?? row.shipmentDate ?? "";
  const loadingDate = row.loadingDate ?? row.shipment?.loadingDate ?? "";
  setField("dispatchDate", dispatchDate);
  setField("loadingDate", loadingDate);

  const transportModeRaw =
    row.transportModeRaw ?? row.transportMode ?? row.shipment?.transportModeRaw ?? row.shipment?.transportMode ?? "";
  setField("transportMode", transportModeRaw);
  const transportOther =
    row.transportOther ?? (transportModeRaw === "기타" ? row.shipment?.transportMode ?? "" : "");
  setField("transportOther", transportOther);

  const incotermsRaw =
    row.incotermsRaw ?? row.incoterms ?? row.shipment?.incotermsRaw ?? row.shipment?.incoterms ?? "";
  setField("incoterms", incotermsRaw);
  const incotermsOther =
    row.incotermsOther ?? (incotermsRaw === "기타" ? row.shipment?.incoterms ?? "" : "");
  setField("incotermsOther", incotermsOther);
  setField("paymentTerms", row.paymentTerms ?? row.shipment?.paymentTerms ?? "");

  const itemsSource = Array.isArray(row.items) ? row.items : [];
  const packingItemsSource = Array.isArray(row.packing?.items) ? row.packing.items : [];
  const maxItems = Math.max(itemsSource.length, packingItemsSource.length);
  const itemRows = [];
  const packingItems = [];

  for (let index = 0; index < maxItems; index += 1) {
    const item = itemsSource[index] || {};
    const packingItem = packingItemsSource[index] || {};
    const idCandidate =
      packingItem.id ??
      packingItem.itemId ??
      packingItem.key ??
      item.id ??
      item.itemId ??
      `item-${index + 1}`;
    const id = idCandidate === undefined || idCandidate === null ? `item-${index + 1}` : String(idCandidate);
    const noValue = item.no ?? item.itemNo ?? packingItem.no ?? index + 1;
    const nameValue = item.name ?? item.itemName ?? packingItem.name ?? "";
    const categoryValue = item.category ?? item.kind ?? item.itemCategory ?? packingItem.kind ?? "";
    const quantityValue =
      item.quantity ?? item.qty ?? packingItem.totalQty ?? packingItem.quantity ?? "";
    const currencyValue = item.currency ?? row.currency ?? "";
    const unitPriceValue = item.unitPrice ?? item.price ?? "";
    const totalValue = item.total ?? item.amount ?? "";
    const originRaw = item.origin ?? item.originCountry ?? packingItem.origin ?? "";
    const originData = resolveCountryData(originRaw);
    const originName = originData?.name ?? (typeof originRaw === "string" ? originRaw.trim() : "");
    const originOther = originData ? "" : (typeof originRaw === "string" ? originRaw.trim() : "");

    if (
      !nameValue &&
      !categoryValue &&
      !quantityValue &&
      !currencyValue &&
      !unitPriceValue &&
      !totalValue &&
      !originName &&
      !originOther
    ) {
      continue;
    }

    itemRows.push({
      id,
      no: toStringOrEmpty(noValue),
      name: toStringOrEmpty(nameValue),
      category: toStringOrEmpty(categoryValue),
      quantity: toStringOrEmpty(quantityValue),
      currency: toStringOrEmpty(currencyValue),
      unitPrice: toStringOrEmpty(unitPriceValue),
      total: toStringOrEmpty(totalValue),
      origin: originName,
      originOther,
    });

    const totalQtyNumeric = toNumberOrZero(
      packingItem.totalQty ?? packingItem.quantity ?? quantityValue ?? 0
    );
    packingItems.push({
      id,
      no: toStringOrEmpty(noValue),
      name: toStringOrEmpty(nameValue),
      kind: toStringOrEmpty(packingItem.kind ?? categoryValue ?? ""),
      totalQty: totalQtyNumeric,
    });
  }

  const packingBoxesSource = Array.isArray(row.packing?.boxes) ? row.packing.boxes : [];
  const packingBoxes = packingBoxesSource.map((box, index) => {
    const contents = Array.isArray(box?.contents)
      ? box.contents
          .map((content) => ({
            itemId: content?.itemId || content?.id || content?.key || "",
            qty: Math.max(0, toNumberOrZero(content?.qty ?? content?.quantity ?? 0)),
          }))
          .filter((content) => content.itemId)
      : [];
    return {
      boxId: box?.boxId || box?.id || `box-${index + 1}`,
      name: box?.name || `Packing ${String(index + 1).padStart(2, "0")}`,
      dimensions: {
        L: toNumberOrZero(box?.dimensions?.L ?? box?.length ?? 0),
        W: toNumberOrZero(box?.dimensions?.W ?? box?.width ?? 0),
        H: toNumberOrZero(box?.dimensions?.H ?? box?.height ?? 0),
        CBM: toNumberOrZero(box?.dimensions?.CBM ?? box?.cbm ?? 0),
      },
      weightKg: toNumberOrZero(box?.weightKg ?? box?.weight ?? 0),
      contents,
      note: toStringOrEmpty(box?.note ?? ""),
    };
  });

  const packingData = packingItems.length || packingBoxes.length ? { items: packingItems, boxes: packingBoxes } : null;

  return { fields, itemRows, packingData, draft: row.draft ?? null };
}

const EXPERT_CERTIFICATES = [
  {
    id: "cert-001",
    name: "레이더 시스템 전문판정서",
    description: "지상 감시 레이더 장비 판정",
    keywords: ["레이더", "감시", "지상"],
  },
  {
    id: "cert-002",
    name: "위성통신 모듈 전문판정서",
    description: "위성 통신용 RF 모듈 판정",
    keywords: ["위성", "통신", "RF"],
  },
  {
    id: "cert-003",
    name: "암호장비 전문판정서",
    description: "보안 암호장비 및 소프트웨어",
    keywords: ["암호", "보안", "소프트웨어"],
  },
  {
    id: "cert-004",
    name: "항공전자 장비 전문판정서",
    description: "항공전자 제어 시스템",
    keywords: ["항공", "전자", "제어"],
  },
].map((item) => ({
  ...item,
  searchValue: [item.name, item.description, ...(item.keywords || [])]
    .join(" ")
    .toLowerCase(),
}));

const ITEM_CURRENCIES = [
  { value: "", label: "선택" },
  { value: "KRW", label: "KRW - 대한민국 원" },
  { value: "USD", label: "USD - 미 달러" },
  { value: "EUR", label: "EUR - 유로" },
  { value: "JPY", label: "JPY - 일본 엔" },
  { value: "CNY", label: "CNY - 중국 위안" },
  { value: "HKD", label: "HKD - 홍콩 달러" },
  { value: "TWD", label: "TWD - 대만 달러" },
];

const ITEM_CURRENCY_OPTIONS_HTML = ITEM_CURRENCIES.map(
  (currency) => `
    <option value="${escapeHtml(currency.value)}">${escapeHtml(currency.label)}</option>
  `
).join("");

const ITEM_ORIGIN_OPTIONS_HTML = [
  '<option value="" disabled selected hidden>생산국을 선택하세요</option>',
  '<option value="기타">기타 (직접 입력)</option>',
  ...COUNTRY_LIST.map(
    (country) =>
      `<option value="${escapeHtml(country.name)}">${escapeHtml(country.name)} (${escapeHtml(country.english)})</option>`
  ),
].join("");

const menuContainer = $("[data-menu]");
const menuButton = menuContainer?.querySelector("[data-menu-button]");
const menuPanel = menuContainer?.querySelector(".menu-panel");

const infoPageConfigs = {
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
  "/": () => renderDashboard("/"),
  "/dashboard": () => renderDashboard("/dashboard"),
  "/export": renderExport,
};

Object.entries(infoPageConfigs).forEach(([path, config]) => {
  routes[path] = () => renderInfoPage(path, config);
});

const menuRoutes = new Set(["/dashboard", "/export", ...Object.keys(infoPageConfigs)]);
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
  const normalizedPath = pathname === "/" ? "/dashboard" : pathname;
  if (menuButton) {
    if (menuRoutes.has(normalizedPath)) {
      menuButton.setAttribute("data-active", "true");
    } else {
      menuButton.removeAttribute("data-active");
    }
  }

  if (menuContainer) {
    $$(".menu-item", menuContainer).forEach((item) => {
      const href = item.getAttribute("href");
      if (href === normalizedPath) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }
}

function renderDashboard(pathname = "/dashboard") {
  const normalizedPath = pathname === "/" ? "/dashboard" : pathname;
  setTopbarActive(normalizedPath);
  document.title = "Dashboard | 수출 및 전략물자";
  app.innerHTML = `
    <section class="card hero">
      <div class="hero-text">
        <h1>환영합니다 👋</h1>
        <p>상단의 <strong>수출 및 전략물자</strong> 탭에서 최신 수출현황을 확인해 보세요.</p>
      </div>
      <a class="btn primary" href="/export" data-link role="button">수출현황 바로가기</a>
    </section>
  `;
  app.focus();
}

function renderExport() {
  setTopbarActive("/export");
  document.title = "수출현황 | 수출 및 전략물자";

  currentPage = 1;
  currentQuery = "";
  currentInvoiceFilter = INVOICE_FILTER_ALL;
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
      <div class="invoice-filter-group" data-invoice-filter-group role="toolbar" aria-label="Invoice 코드 필터">
        <button type="button" class="btn filter-btn" data-invoice-filter="all" aria-pressed="true">전체</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="missing-items">항목없음</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="no-code">Invoice 없음</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SEA" title="정상판매">SEA</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SEE" title="A/S · 기타 A/S">SEE</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SED" title="BMT · 제조사샘플 · 개발용샘플">SED</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SEC" title="장애교체 · 기타 장애교체">SEC</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SEB" title="TEST · Stock · 임대 · 유상임대">SEB</button>
        <button type="button" class="btn filter-btn" data-invoice-filter="SET" title="기타">SET</button>
      </div>
    </section>

    <section class="card table-card">
      <div class="table-wrap">
        <table class="export-table" aria-label="수출 목록">
          <colgroup>
            <col class="col-no" />
            <col class="col-type" />
            <col class="col-strategic" />
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
              <th scope="col" rowspan="2">전략물자 구분</th>
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
  const invoiceFilterGroup = $("[data-invoice-filter-group]");
  if (invoiceFilterGroup) {
    invoiceFilterGroup.addEventListener("click", handleInvoiceFilterClick);
    updateInvoiceFilterButtons();
  }
  $("#newBtn").addEventListener("click", openNewDialog);
  const continueButton = $("#continueBtn");
  if (continueButton) {
    continueButton.hidden = true;
    continueButton.addEventListener("click", () => {
      const selectedIds = getSelectedDraftRowIds();
      if (!selectedIds.length) return;
      if (selectedIds.length > 1) {
        alert("이어서 등록할 임시저장 건을 하나만 선택해주세요.");
        return;
      }
      const resumed = resumeDraftEntry(selectedIds[0]);
      if (!resumed) {
        alert("선택한 임시저장 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
      }
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
  if (!tbody) return [];

  const page = meta.page ?? 1;
  const pageSize = lastMeta.pageSize ?? PAGE_SIZE;
  const startIndex = (page - 1) * pageSize;

  const filteredRows = applyInvoiceFilter(rows);
  lastFilteredCount = filteredRows.length;

  if (!filteredRows.length) {
    tbody.innerHTML = `<tr><td colspan="${EXPORT_TABLE_COLSPAN}" data-empty="true">데이터가 없습니다.</td></tr>`;
    lastCombinedRows = [];
    updateContinueButtonVisibility();
    return filteredRows;
  }

  const qtyFormatter = new Intl.NumberFormat("ko-KR");

  const docValue = (value) => {
    if (value === undefined || value === null || value === "") return "-";
    return escapeHtml(String(value));
  };

  const invoiceSequenceTracker = new Map();

  tbody.innerHTML = filteredRows
    .map((row, idx) => {
      const seq = startIndex + idx + 1;
      const shipmentDateValue =
        row.dispatchDate ||
        row.shipmentDate ||
        (row.shipment && (row.shipment.dispatchDate || row.shipment.shipmentDate)) ||
        row.createdAt;
      const shipmentDate = formatDate(shipmentDateValue);
      const shipmentTypeRaw = row.shipmentType || row.shipmentPurpose || row.exportType || row.shipmentTypeRaw || "";
      const shipmentType = shipmentTypeRaw ? escapeHtml(String(shipmentTypeRaw)) : "-";
      const strategicRaw =
        row.strategicCategory ?? row.strategicClassification ?? row.strategicFlag ?? "";
      const strategicClassification = strategicRaw
        ? escapeHtml(String(strategicRaw))
        : "-";
      const projectName = row.projectName ? escapeHtml(String(row.projectName)) : "-";
      const projectCode = row.projectCode ? escapeHtml(String(row.projectCode)) : "-";
      const item = row.item ? escapeHtml(String(row.item)) : "-";
      const qty = formatNumber(row.qty, qtyFormatter);
      const clientRaw = row.client || row.importer?.companyName || "";
      const client = clientRaw ? escapeHtml(String(clientRaw)) : "-";
      const endUserRaw = row.endUser || row.importer?.companyName || row.client || "";
      const endUser = endUserRaw ? escapeHtml(String(endUserRaw)) : "-";
      const countryRaw =
        row.country ||
        row.destinationCountry ||
        row.shipment?.destinationCountry ||
        row.importer?.country ||
        "";
      const country = countryRaw ? escapeHtml(String(countryRaw).toUpperCase()) : "-";
      const departmentRaw = row.department || row.requester?.department || "";
      const department = departmentRaw ? escapeHtml(String(departmentRaw)) : "-";
      const managerRaw = row.manager || row.requester?.name || "";
      const manager = managerRaw ? escapeHtml(String(managerRaw)) : "-";
      const statusRaw = row.status ? String(row.status) : "";
      const status = statusRaw ? escapeHtml(statusRaw) : "-";
      const noteRaw = row.invoiceNote ?? row.note ?? "";
      const note = noteRaw ? escapeHtml(String(noteRaw)) : "-";
      const plStatus = docValue(row.plStatus);
      const invoiceStatus = docValue(row.invoiceStatus);
      const invoiceInfo = resolveInvoiceInfo(row);
      const hasItems = rowHasItemDetails(row);
      const invoicePieces = [];
      const invoiceExistingNumber = resolveExistingInvoiceNumber(row);
      const invoiceDateKey = formatInvoiceDateKey(shipmentDateValue);
      const invoiceCodeNormalized = invoiceInfo?.code ? String(invoiceInfo.code).trim().toUpperCase() : "";
      let invoiceSequenceValue = resolveInvoiceSequence(row);
      if (invoiceCodeNormalized && invoiceDateKey) {
        const trackerKey = `${invoiceCodeNormalized}|${invoiceDateKey}`;
        if (invoiceSequenceValue) {
          const currentMax = invoiceSequenceTracker.get(trackerKey) ?? 0;
          if (invoiceSequenceValue > currentMax) {
            invoiceSequenceTracker.set(trackerKey, invoiceSequenceValue);
          }
        } else {
          const nextSeq = (invoiceSequenceTracker.get(trackerKey) ?? 0) + 1;
          invoiceSequenceValue = nextSeq;
          invoiceSequenceTracker.set(trackerKey, nextSeq);
        }
      }
      const invoiceNumber = formatInvoiceNumber({
        code: invoiceInfo?.code ?? "",
        date: shipmentDateValue,
        sequence: invoiceSequenceValue,
        existingNumber: invoiceExistingNumber,
      });
      if (invoiceSequenceValue) {
        row._computedInvoiceSequence = invoiceSequenceValue;
      } else {
        delete row._computedInvoiceSequence;
      }
      if (invoiceNumber) {
        row._computedInvoiceNumber = invoiceNumber;
      } else {
        delete row._computedInvoiceNumber;
      }
      if (invoiceNumber) {
        const numberText = escapeHtml(String(invoiceNumber));
        const downloadUrl = buildInvoiceDownloadUrl(row);
        if (downloadUrl) {
          const safeUrl = escapeHtml(downloadUrl);
          invoicePieces.push(
            `<a href="${safeUrl}" class="invoice-link" download>${numberText}</a>`
          );
        } else {
          invoicePieces.push(numberText);
        }
        if (invoiceInfo?.label) {
          invoicePieces.push(escapeHtml(String(invoiceInfo.label)));
        }
      } else if (invoiceInfo && invoiceInfo.code) {
        const codeText = escapeHtml(String(invoiceInfo.code));
        const labelText = invoiceInfo.label ? escapeHtml(String(invoiceInfo.label)) : "";
        invoicePieces.push(labelText ? `Invoice ${codeText} (${labelText})` : `Invoice ${codeText}`);
      } else {
        invoicePieces.push("Invoice");
      }
      if (invoiceStatus !== "-") {
        invoicePieces.push(invoiceStatus);
      }
      if (!hasItems) {
        invoicePieces.push("항목없음");
      }
      const invoiceDisplay = invoicePieces.filter(Boolean).join(" · ");
      const permitStatus = docValue(row.permitStatus);
      const declarationStatus = docValue(row.declarationStatus);
      const usageStatus = docValue(row.usageStatus);
      const blStatus = docValue(row.blStatus);
      const fileNote = docValue(row.fileNote);
      const statusNormalized = statusRaw.replace(/\s+/g, "");
      const isDraftStatus = Boolean(row.isDraft) || statusNormalized.includes("임시저장");
      const rowIdentifier = resolveRowIdentifier(row, startIndex + idx);
      row._entryId = rowIdentifier;
      const selectBox = `<input type="checkbox" data-select data-entry-id="${escapeHtml(String(rowIdentifier))}" data-draft="${isDraftStatus ? "true" : "false"}" aria-label="선택" />`;
      const rowAttrs = isDraftStatus ? " data-draft=\"true\"" : row.isDraft ? " data-draft=\"true\"" : "";

      return `
        <tr${rowAttrs}>
          ${td(String(seq), { align: "center" })}
          ${td(shipmentType, { empty: shipmentType === "-" })}
          ${td(strategicClassification, { empty: strategicClassification === "-" })}
          ${td(shipmentDate, { empty: shipmentDate === "-" })}
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
          ${td(invoiceDisplay ? invoiceDisplay : "-", { empty: invoiceDisplay === "" })}
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

  lastCombinedRows = filteredRows.slice();
  ensureSelectionHandlers();
  updateContinueButtonVisibility();
  return filteredRows;
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

function findDraftEntryById(entryId) {
  if (entryId === undefined || entryId === null) return null;
  const target = String(entryId).trim();
  if (!target) return null;
  for (const entry of draftEntries) {
    if (!entry || typeof entry !== "object") continue;
    const candidates = [entry.id, entry.row?._entryId, entry.row?.id];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      if (String(candidate).trim() === target) {
        return entry;
      }
    }
  }
  return null;
}

function findRowByEntryId(entryId) {
  if (entryId === undefined || entryId === null) return null;
  const target = String(entryId).trim();
  if (!target) return null;
  for (const row of lastCombinedRows) {
    if (!row || typeof row !== "object") continue;
    const candidates = [
      row._entryId,
      row.id,
      row._id,
      row.seq,
      row.projectCode,
      row.contractNumber,
    ];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      if (String(candidate).trim() === target) {
        return row;
      }
    }
  }
  return null;
}

function normalizeResumeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const normalized = { ...meta };
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const stepIndex = toNumber(normalized.stepIndex);
  if (stepIndex !== null) {
    normalized.stepIndex = Math.max(0, Math.floor(stepIndex));
  } else if (Object.prototype.hasOwnProperty.call(normalized, "stepIndex")) {
    delete normalized.stepIndex;
  }

  const resumeStep = toNumber(normalized.resumeStep);
  if (resumeStep !== null) {
    normalized.resumeStep = Math.max(0, Math.floor(resumeStep));
  } else if (Object.prototype.hasOwnProperty.call(normalized, "resumeStep")) {
    delete normalized.resumeStep;
  }

  const completedSteps = toNumber(normalized.completedSteps);
  if (completedSteps !== null) {
    normalized.completedSteps = Math.max(0, Math.floor(completedSteps));
  } else if (Object.prototype.hasOwnProperty.call(normalized, "completedSteps")) {
    delete normalized.completedSteps;
  }

  const totalSteps = toNumber(normalized.totalSteps);
  if (totalSteps !== null) {
    normalized.totalSteps = Math.max(0, Math.floor(totalSteps));
  } else if (Object.prototype.hasOwnProperty.call(normalized, "totalSteps")) {
    delete normalized.totalSteps;
  }

  return normalized;
}

function computeStartStep(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (Number.isFinite(meta.stepIndex)) return Math.max(0, Math.floor(meta.stepIndex));
  if (Number.isFinite(meta.resumeStep)) return Math.max(0, Math.floor(meta.resumeStep));
  if (Number.isFinite(meta.completedSteps)) {
    return Math.max(0, Math.floor(meta.completedSteps) - 1);
  }
  return null;
}

function resumeDraftEntry(entryId) {
  const entry = findDraftEntryById(entryId);
  if (entry) {
    const mapped = mapRowToFormValues(entry.row || {});
    const packingData = entry.packingData
      ? clonePackingData(entry.packingData)
      : clonePackingData(mapped.packingData);
    const resumeMeta = normalizeResumeMeta(entry.draftMeta || mapped.draft);
    const startStep = computeStartStep(resumeMeta);
    openNewDialog({
      initialData: {
        fields: mapped.fields,
        itemRows: mapped.itemRows,
        packingData,
        draft: resumeMeta,
      },
      resumeMeta,
      startStep,
    });
    return true;
  }

  const row = findRowByEntryId(entryId);
  if (row) {
    const mapped = mapRowToFormValues(row);
    const packingData = clonePackingData(mapped.packingData || row.packing);
    const resumeMeta = normalizeResumeMeta(row.draft || mapped.draft);
    const startStep = computeStartStep(resumeMeta);
    openNewDialog({
      initialData: {
        fields: mapped.fields,
        itemRows: mapped.itemRows,
        packingData,
        draft: resumeMeta,
      },
      resumeMeta,
      startStep,
    });
    return true;
  }

  return false;
}

function updateContinueButtonVisibility() {
  const continueButton = $("#continueBtn");
  if (!continueButton) return;
  const hasDraftSelection = getSelectedDraftRowIds().length > 0;
  continueButton.hidden = !hasDraftSelection;
}

function getCombinedRows(serverRows = []) {
  const draftRows = draftEntries.map((entry) => entry.row);
  return [...draftRows, ...serverRows];
}

function resolveInvoiceCodeFromType(exportType, exportTypeDetail) {
  if (!exportType) return null;
  const normalized = String(exportType).trim();
  if (!normalized) return null;
  const info = EXPORT_TYPE_INVOICE_CODES[normalized];
  if (!info) return null;
  const label =
    normalized === "기타" && exportTypeDetail
      ? String(exportTypeDetail).trim() || info.label
      : info.label;
  return { code: info.code, label };
}

function resolveInvoiceInfo(row = {}) {
  if (!row || typeof row !== "object") return null;
  const rawCode =
    row.invoiceCode ??
    row.invoice_code ??
    row.invoiceTypeCode ??
    row.invoice_type_code ??
    null;
  const rawLabel =
    row.invoiceCodeLabel ??
    row.invoiceLabel ??
    row.invoiceNote ??
    row.invoiceRemark ??
    row.invoiceDescription ??
    row.invoice_code_label ??
    "";
  if (rawCode) {
    return {
      code: String(rawCode).trim(),
      label: rawLabel ? String(rawLabel).trim() : "",
    };
  }
  const exportType = row.exportType ?? row.shipmentTypeRaw ?? row.shipmentType ?? "";
  const exportTypeDetail = row.exportTypeDetail ?? row.shipmentPurpose ?? "";
  const info = resolveInvoiceCodeFromType(exportType, exportTypeDetail);
  if (info) return info;
  return null;
}

function rowHasItemDetails(row = {}) {
  if (!row || typeof row !== "object") return false;
  if (Array.isArray(row.items) && row.items.length) {
    return row.items.some((item) => {
      if (!item || typeof item !== "object") return false;
      return Object.values(item).some((value) => {
        if (value === undefined || value === null) return false;
        return String(value).trim() !== "";
      });
    });
  }
  return false;
}

function matchesInvoiceFilter(row, filter = currentInvoiceFilter) {
  if (!row || typeof row !== "object") return false;
  if (!filter || filter === INVOICE_FILTER_ALL) return true;
  if (filter === INVOICE_FILTER_MISSING_ITEMS) {
    return !rowHasItemDetails(row);
  }
  const info = resolveInvoiceInfo(row);
  if (filter === INVOICE_FILTER_NO_CODE) {
    return !(info && info.code);
  }
  if (!info || !info.code) return false;
  return String(info.code).toUpperCase() === String(filter).toUpperCase();
}

function applyInvoiceFilter(rows = []) {
  if (!Array.isArray(rows)) return [];
  if (!rows.length) return [];
  if (currentInvoiceFilter === INVOICE_FILTER_ALL) {
    return rows.slice();
  }
  return rows.filter((row) => matchesInvoiceFilter(row, currentInvoiceFilter));
}

function updateInvoiceFilterButtons() {
  const group = $(`[data-invoice-filter-group]`);
  if (!group) return;
  const buttons = $$('[data-invoice-filter]', group);
  buttons.forEach((button) => {
    const value = button.dataset.invoiceFilter ?? "";
    const isActive = value === currentInvoiceFilter;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    if (isActive) {
      button.dataset.active = "true";
    } else {
      delete button.dataset.active;
    }
  });
}

function handleInvoiceFilterClick(event) {
  const button = event.target.closest('[data-invoice-filter]');
  if (!button) return;
  const value = button.dataset.invoiceFilter ?? INVOICE_FILTER_ALL;
  if (!value) return;
  if (value === currentInvoiceFilter) return;
  currentInvoiceFilter = value;
  updateInvoiceFilterButtons();
  renderRows(getCombinedRows(lastFetchedItems), { page: currentPage });
  renderPagination();
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
    const normalized = typeof value === "string" ? value.trim() : value;
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const existing = data[key];
      if (Array.isArray(existing)) {
        existing.push(normalized);
      } else {
        data[key] = [existing, normalized];
      }
    } else {
      data[key] = normalized;
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
  const exportNote = trim(data.exportNote);
  const strategicFlag = trim(data.strategicFlag);
  const strategicExpertCertificate = trim(data.strategicExpertCertificate);
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
  const notifySameAsImporter = Boolean(data.notifySameAsImporter);
  const notifyCompanyName = trim(data.notifyCompanyName);
  const notifyAddress = trim(data.notifyAddress);
  const notifyCountry = trim(data.notifyCountry);
  const notifyCountryCode = trim(data.notifyCountryCode);
  const notifyPhone = trim(data.notifyPhone);
  const notifyContactName = trim(data.notifyContactName);
  const notifyContactPhone = trim(data.notifyContactPhone);
  const notifyEmail = trim(data.notifyEmail);
  const notifyEtc = trim(data.notifyEtc);
  const originCountry = trim(data.originCountry);
  const destinationCountry = trim(data.destinationCountry);
  const dispatchDate = trim(data.dispatchDate);
  const transportMode = trim(data.transportMode);
  const transportOther = trim(data.transportOther);
  const loadingDate = trim(data.loadingDate);
  const incoterms = trim(data.incoterms);
  const incotermsOther = trim(data.incotermsOther);
  const paymentTerms = trim(data.paymentTerms);
  const invoiceCodeInputValue = trim(data.invoiceCode);
  const invoiceCodeLabelInputValue = trim(data.invoiceCodeLabel);

  const toArray = (val) => {
    if (val === undefined || val === null) return [];
    if (Array.isArray(val)) return val.map((item) => trim(item));
    return [trim(val)];
  };

  const itemNos = toArray(data.itemNo);
  const itemNames = toArray(data.itemName);
  const itemCategories = toArray(data.itemCategory);
  const itemQuantities = toArray(data.itemQuantity);
  const itemCurrencies = toArray(data.itemCurrency);
  const itemUnitPrices = toArray(data.itemUnitPrice);
  const itemTotals = toArray(data.itemTotal);
  const itemOrigins = toArray(data.itemOrigin);
  const itemOriginOthers = toArray(data.itemOriginOther);
  const itemCount = Math.max(
    itemNos.length,
    itemNames.length,
    itemCategories.length,
    itemQuantities.length,
    itemCurrencies.length,
    itemUnitPrices.length,
    itemTotals.length,
    itemOrigins.length,
    itemOriginOthers.length,
  );

  const items = Array.from({ length: itemCount }, (_, idx) => {
    const originChoice = itemOrigins[idx] ?? "";
    const originOtherValue = itemOriginOthers[idx] ?? "";
    const resolvedOrigin = originChoice === "기타" ? originOtherValue : originChoice;
    return {
      no: itemNos[idx] ?? "",
      name: itemNames[idx] ?? "",
      category: itemCategories[idx] ?? "",
      quantity: itemQuantities[idx] ?? "",
      currency: itemCurrencies[idx] ?? "",
      unitPrice: itemUnitPrices[idx] ?? "",
      total: itemTotals[idx] ?? "",
      origin: resolvedOrigin ?? "",
    };
  }).filter((item) => Object.values(item).some((value) => value !== "" && value !== undefined));

  const firstItem = items[0] || {};
  const firstItemQty = Number(firstItem.quantity);
  const firstItemUnitPrice = Number(firstItem.unitPrice);
  const normalizedQty = Number.isFinite(firstItemQty) ? firstItemQty : 0;
  const normalizedUnitPrice = Number.isFinite(firstItemUnitPrice) ? firstItemUnitPrice : 0;

  const resolvedPurpose = exportType === "기타" && exportTypeDetail ? exportTypeDetail : exportType;
  const resolvedTransportMode = transportMode === "기타" && transportOther ? transportOther : transportMode;
  const resolvedIncoterms = incoterms === "기타" && incotermsOther ? incotermsOther : incoterms;
  const resolvedDispatchDate = dispatchDate || "";
  const invoiceInfoFromType = resolveInvoiceCodeFromType(exportType, exportTypeDetail);
  const resolvedInvoiceCode = invoiceInfoFromType?.code || invoiceCodeInputValue || "";
  const resolvedInvoiceLabel = invoiceInfoFromType?.label || invoiceCodeLabelInputValue || "";
  const invoiceNote = exportNote || resolvedInvoiceLabel;

  const payload = {
    exportType,
    exportTypeDetail: exportType === "기타" ? exportTypeDetail : "",
    projectName,
    projectCode,
    strategicFlag,
    strategicExpertCertificate,
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
    notifySameAsImporter,
    notifyCompanyName,
    notifyAddress,
    notifyCountry,
    notifyCountryCode,
    notifyPhone,
    notifyContactName,
    notifyContactPhone,
    notifyEmail,
    notifyEtc,
    originCountry,
    destinationCountry,
    dispatchDate: resolvedDispatchDate,
    transportMode,
    transportOther: transportMode === "기타" ? transportOther : "",
    loadingDate,
    incoterms,
    incotermsOther: incoterms === "기타" ? incotermsOther : "",
    paymentTerms,
    items,
    item: firstItem.name || "",
    qty: normalizedQty,
    unitPrice: normalizedUnitPrice,
    currency: firstItem.currency || "",
    invoiceCode: resolvedInvoiceCode,
    invoiceCodeLabel: resolvedInvoiceLabel,
    invoiceNote,
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
    notifyParty: {
      sameAsImporter: notifySameAsImporter,
      companyName: notifyCompanyName,
      address: notifyAddress,
      country: notifyCountry,
      countryCode: notifyCountryCode,
      phone: notifyPhone,
      contactName: notifyContactName,
      contactPhone: notifyContactPhone,
      email: notifyEmail,
      etc: notifyEtc,
    },
    shipment: {
      originCountry,
      destinationCountry,
      dispatchDate,
      loadingDate,
      transportMode: resolvedTransportMode,
      transportModeRaw: transportMode,
      incoterms: resolvedIncoterms,
      incotermsRaw: incoterms,
      paymentTerms,
    },
    shipmentType: resolvedPurpose,
    shipmentTypeRaw: exportType,
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
    endUser: importCompanyName,
    note: importEtc,
    shipmentDate: resolvedDispatchDate,
    country: (destinationCountry || importCountry || firstItem.origin || originCountry || "").toUpperCase(),
    status: "대기",
  };
  if (!payload.note && invoiceNote) {
    payload.note = invoiceNote;
  }
  return payload;
}

function mapFormDataToRow(
  data = {},
  { draft = false, completedSteps, totalSteps, savedAt } = {}
) {
  const payload = mapFormDataToPayload(data);
  const row = {
    ...payload,
    createdAt: Date.now(),
    status: draft ? "임시저장" : payload.status,
    note: payload.note || (draft ? "임시 저장" : ""),
    isDraft: draft,
  };
  row.country = payload.country ? payload.country.toUpperCase() : "";
  if (draft) {
    const draftMeta = {};
    if (Number.isFinite(completedSteps)) {
      draftMeta.completedSteps = Math.max(0, Math.floor(Number(completedSteps)));
    }
    if (Number.isFinite(totalSteps)) {
      draftMeta.totalSteps = Math.max(0, Math.floor(Number(totalSteps)));
    }
    draftMeta.savedAt = savedAt || new Date().toISOString();
    row.draft = { ...(row.draft || {}), ...draftMeta };
  }
  return row;
}

function clonePackingData(packingData) {
  if (!packingData || typeof packingData !== "object") return null;
  const items = Array.isArray(packingData.items)
    ? packingData.items.map((item) => ({
        id: item?.id || item?.itemId || item?.key || "",
        no: item?.no ?? "",
        name: item?.name ?? "",
        kind: item?.kind ?? "",
        totalQty: Number(item?.totalQty ?? item?.quantity ?? 0) || 0,
      }))
    : [];
  const boxes = Array.isArray(packingData.boxes)
    ? packingData.boxes.map((box, index) => ({
        boxId: box?.boxId || box?.id || `box-${index + 1}`,
        name: box?.name || `Packing ${String(index + 1).padStart(2, "0")}`,
        dimensions: {
          L: Number(box?.dimensions?.L ?? box?.length ?? 0) || 0,
          W: Number(box?.dimensions?.W ?? box?.width ?? 0) || 0,
          H: Number(box?.dimensions?.H ?? box?.height ?? 0) || 0,
          CBM: Number(box?.dimensions?.CBM ?? box?.cbm ?? 0) || 0,
        },
        weightKg: Number(box?.weightKg ?? box?.weight ?? 0) || 0,
        contents: Array.isArray(box?.contents)
          ? box.contents
              .map((content) => ({
                itemId: content?.itemId || content?.id || content?.key || "",
                qty: Math.max(0, Number(content?.qty ?? content?.quantity ?? 0) || 0),
              }))
              .filter((content) => content.itemId)
          : [],
        note: box?.note ?? "",
      }))
    : [];
  return { items, boxes };
}

function addDraftEntry(
  data,
  { stepIndex = 0, totalSteps, packingData } = {}
) {
  const normalizedTotalSteps = Number.isFinite(totalSteps) && totalSteps > 0 ? Math.floor(totalSteps) : undefined;
  const completedSteps = Number.isFinite(stepIndex)
    ? Math.max(0, Math.floor(Number(stepIndex)) + 1)
    : 1;
  const cappedCompletedSteps = normalizedTotalSteps
    ? Math.min(normalizedTotalSteps, completedSteps)
    : completedSteps;
  const savedAt = new Date().toISOString();
  const row = mapFormDataToRow(data, {
    draft: true,
    completedSteps: cappedCompletedSteps,
    totalSteps: normalizedTotalSteps,
    savedAt,
  });
  row.id = `D${Date.now()}_${Math.abs(draftSeq--)}`;
  row._entryId = row.id;
  const entry = {
    id: row.id,
    row,
    formValues: data,
    packingData: clonePackingData(packingData),
    draftMeta: {
      stepIndex: Number.isFinite(stepIndex) ? Math.max(0, Math.floor(Number(stepIndex))) : 0,
      completedSteps: cappedCompletedSteps,
      totalSteps: normalizedTotalSteps ?? null,
      savedAt,
    },
  };
  draftEntries.unshift(entry);
  return entry;
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
  const filteredCount = lastFilteredCount ?? 0;
  if (currentInvoiceFilter !== INVOICE_FILTER_ALL) {
    resultCount.textContent = `표시 ${filteredCount.toLocaleString("ko-KR")}건 / 총 ${totalCount.toLocaleString("ko-KR")}건`;
  } else {
    resultCount.textContent = `총 ${totalCount.toLocaleString("ko-KR")}건`;
  }

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

function openNewDialog(options = {}) {
  const dialog = $("#newExportDialog");
  const form = $("#newExportForm");
  if (!dialog || !form) return;

  const initialData = options.initialData || {};
  const fieldValues = initialData.fields || options.fieldValues || null;
  const itemRowsData = Array.isArray(initialData.itemRows)
    ? initialData.itemRows
    : Array.isArray(options.itemRows)
    ? options.itemRows
    : [];
  const packingData = initialData.packingData || options.packingData || null;
  const resumeMeta = options.resumeMeta ?? initialData.draft ?? null;
  const explicitStep =
    Number.isFinite(options.startStep) ? Math.floor(Number(options.startStep)) : null;

  form.reset();

  const steps = $$(".step", form);
  const totalSteps = steps.length;
  let currentStep = 0;
  if (totalSteps > 0) {
    if (explicitStep !== null) {
      currentStep = Math.max(0, Math.min(totalSteps - 1, explicitStep));
    } else {
      currentStep = resolveResumeStep(resumeMeta, totalSteps);
    }
  }
  const packingStepIndex = steps.findIndex((step) => step.hasAttribute("data-packing-step"));
  let syncPackingVisibility = null;

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
  const invoiceCodeDisplay = form.querySelector("[data-invoice-code-display]");
  const invoiceNoteInput = form.querySelector("[data-invoice-note]");
  const invoiceCodeInput = form.querySelector("[data-invoice-code-input]");
  const invoiceCodeLabelInput = form.querySelector("[data-invoice-code-label-input]");
  const dispatchDateInput = form.querySelector("input[name=dispatchDate]");
  delete form.dataset.invoiceSequence;
  delete form.dataset.invoiceExistingNumber;
  if (invoiceNoteInput instanceof HTMLInputElement) {
    invoiceNoteInput.dataset.manual = "";
    invoiceNoteInput.dataset.autoValue = "";
  }
  if (invoiceCodeInput instanceof HTMLInputElement) {
    invoiceCodeInput.value = "";
  }
  if (invoiceCodeLabelInput instanceof HTMLInputElement) {
    invoiceCodeLabelInput.value = "";
  }
  if (invoiceCodeDisplay instanceof HTMLElement) {
    invoiceCodeDisplay.textContent = "Invoice 코드가 선택되면 자동으로 표시됩니다.";
  }
  const strategicGroup = form.querySelector("[data-required-group]");
  const strategicValueInput = form.querySelector("[data-strategic-value]");
  const strategicOptions = strategicGroup
    ? $$('input[type="checkbox"][data-strategic-option]', strategicGroup)
    : [];
  const expertSearchContainer = form.querySelector('[data-expert-search]');
  const expertKeywordInput = expertSearchContainer?.querySelector('[data-expert-input]');
  const expertSearchButton = expertSearchContainer?.querySelector('[data-expert-search-btn]');
  const expertResultsList = expertSearchContainer?.querySelector('[data-expert-results]');
  const expertSelectedName = expertSearchContainer?.querySelector('[data-expert-selected-name]');
  const expertSelectedValueInput = expertSearchContainer?.querySelector('[data-expert-selected-value]');
  const expertClearButton = expertSearchContainer?.querySelector('[data-expert-clear]');
  const countrySelectContainer = form.querySelector("[data-country-select]");
  const simpleCountrySelects = $$('[data-country-select-simple]', form);
  const notifyCheckbox = form.querySelector('[data-notify-copy]');
  const transportModeSelect = form.querySelector('select[name=transportMode]');
  const transportDetailLabel = form.querySelector('[data-transport-detail]');
  const transportOtherInput = form.querySelector('input[name=transportOther]');
  const incotermsSelect = form.querySelector('select[name=incoterms]');
  const incotermsDetailLabel = form.querySelector('[data-incoterms-detail]');
  const incotermsOtherInput = form.querySelector('input[name=incotermsOther]');
  const itemsStep = form.querySelector('[data-items-step]');
  const itemRows = itemsStep?.querySelector('[data-item-rows]');
  const addItemButton = itemsStep?.querySelector('[data-item-add]');
  const removeItemButton = itemsStep?.querySelector('[data-item-remove]');

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

    if (expertSearchContainer && stepEl.contains(expertSearchContainer)) {
      const requiresExpert = (strategicValueInput?.value || "") === "전략물자 수출";
      const selectedValue =
        expertSelectedValueInput instanceof HTMLInputElement
          ? (expertSelectedValueInput.value || "").trim()
          : "";
      if (requiresExpert && !selectedValue) {
        return false;
      }
    }

    if (stepEl.hasAttribute("data-items-step")) {
      const rows = $$('[data-item-row]', stepEl);
      if (!rows.length) return false;
      for (const row of rows) {
        const inputs = $$('[data-item-input]', row);
        for (const input of inputs) {
          if (input.disabled) continue;
          if (typeof input.value === "string" && input.value.trim() === "") {
            return false;
          }
        }
      }
    }

    if (stepEl.hasAttribute("data-packing-step")) {
      const packingState = form._packingState;
      const boxes = Array.isArray(packingState?.boxes) ? packingState.boxes : [];
      if (!boxes.length) {
        return false;
      }
      if (typeof packingState?.canComplete === 'function') {
        if (!packingState.canComplete()) {
          return false;
        }
      } else {
        const items = Array.isArray(packingState?.items) ? packingState.items : [];
        const remainders =
          typeof packingState?.getRemainders === 'function'
            ? packingState.getRemainders()
            : new Map(items.map((item) => [item.id ?? item.key, Number(item?.totalQty ?? item?.quantity ?? 0)]));
        const hasPositiveItems = items.some((item) => Number(item?.totalQty ?? item?.quantity ?? 0) > 0);
        if (!hasPositiveItems) {
          return false;
        }
        for (const item of items) {
          const total = Number(item?.totalQty ?? item?.quantity ?? 0);
          if (!Number.isFinite(total) || total <= 0) continue;
          const key = item.id ?? item.key;
          const remain = key != null ? remainders.get(key) : undefined;
          if ((remain ?? total) > 0) {
            return false;
          }
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

  const updateInvoiceCodeState = ({ force = false } = {}) => {
    const exportTypeValue =
      exportTypeSelect instanceof HTMLSelectElement ? exportTypeSelect.value : "";
    const detailValue =
      exportTypeDetailInput instanceof HTMLInputElement ? exportTypeDetailInput.value : "";
    let info = resolveInvoiceCodeFromType(exportTypeValue, detailValue);
    if ((!info || !info.code) && invoiceCodeInput instanceof HTMLInputElement) {
      const fallbackCode = invoiceCodeInput.value ?? "";
      const fallbackLabel = invoiceCodeLabelInput instanceof HTMLInputElement ? invoiceCodeLabelInput.value ?? "" : "";
      if (fallbackCode) {
        info = { code: fallbackCode, label: fallbackLabel };
      }
    }
    const code = info?.code ?? "";
    const label = info?.label ?? "";
    const dispatchDateValue =
      dispatchDateInput instanceof HTMLInputElement ? dispatchDateInput.value : "";
    const dateKey = formatInvoiceDateKey(dispatchDateValue);
    const existingNumber = form.dataset.invoiceExistingNumber ?? "";
    let sequence = parsePositiveInteger(form.dataset.invoiceSequence);
    if (!sequence && existingNumber) {
      sequence = extractSequenceFromInvoiceNumber(existingNumber);
    }
    if (!sequence && code && dateKey) {
      sequence = estimateNextInvoiceSequence(code, dateKey);
    }
    const invoiceNumberText = formatInvoiceNumber({
      code,
      date: dispatchDateValue,
      sequence,
      existingNumber,
    });
    if (invoiceNumberText) {
      form.dataset.invoiceExistingNumber = invoiceNumberText;
      if (sequence) {
        form.dataset.invoiceSequence = String(sequence);
      }
    } else if (
      !code ||
      (existingNumber &&
        !existingNumber.toUpperCase().startsWith(String(code).toUpperCase()))
    ) {
      delete form.dataset.invoiceExistingNumber;
      delete form.dataset.invoiceSequence;
    }
    if (invoiceCodeDisplay instanceof HTMLElement) {
      if (invoiceNumberText) {
        invoiceCodeDisplay.textContent = label
          ? `${invoiceNumberText}${label ? ` (${label})` : ""}`
          : invoiceNumberText;
      } else if (code) {
        invoiceCodeDisplay.textContent = `Invoice ${code}${label ? ` (${label})` : ""}`;
      } else {
        invoiceCodeDisplay.textContent = "Invoice 코드가 선택되면 자동으로 표시됩니다.";
      }
    }
    if (invoiceCodeInput instanceof HTMLInputElement) {
      invoiceCodeInput.value = code;
    }
    if (invoiceCodeLabelInput instanceof HTMLInputElement) {
      invoiceCodeLabelInput.value = label;
    }
    if (invoiceNoteInput instanceof HTMLInputElement) {
      const autoValue = label || "";
      const currentAuto = invoiceNoteInput.dataset.autoValue ?? "";
      const normalizedCurrent = currentAuto.trim();
      const normalizedAuto = autoValue.trim();
      const isManual = invoiceNoteInput.dataset.manual === "true" && !force;
      if (!isManual) {
        invoiceNoteInput.value = autoValue;
        invoiceNoteInput.dataset.manual = autoValue ? "false" : "";
      }
      invoiceNoteInput.dataset.autoValue = autoValue;
      if (!autoValue && !invoiceNoteInput.placeholder) {
        invoiceNoteInput.placeholder = "예: 수출계약";
      }
      if (!isManual && normalizedAuto !== normalizedCurrent) {
        invoiceNoteInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
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
    updateInvoiceCodeState({ force: true });
  };

  if (invoiceNoteInput instanceof HTMLInputElement && !invoiceNoteInput.dataset.boundInvoiceNote) {
    invoiceNoteInput.addEventListener("input", () => {
      const autoValue = invoiceNoteInput.dataset.autoValue ?? "";
      const currentValue = invoiceNoteInput.value ?? "";
      const normalizedAuto = autoValue.trim();
      const normalizedCurrent = currentValue.trim();
      if (!normalizedCurrent) {
        invoiceNoteInput.dataset.manual = "";
      } else if (normalizedCurrent !== normalizedAuto) {
        invoiceNoteInput.dataset.manual = "true";
      } else {
        invoiceNoteInput.dataset.manual = "false";
      }
    });
    invoiceNoteInput.dataset.boundInvoiceNote = "true";
  }
  if (dispatchDateInput instanceof HTMLInputElement && !dispatchDateInput.dataset.boundInvoiceDate) {
    const handleDispatchDateChange = () => updateInvoiceCodeState({ force: true });
    dispatchDateInput.addEventListener("input", handleDispatchDateChange);
    dispatchDateInput.addEventListener("change", handleDispatchDateChange);
    dispatchDateInput.dataset.boundInvoiceDate = "true";
  }
  if (exportTypeDetailInput instanceof HTMLInputElement && !exportTypeDetailInput.dataset.boundInvoiceDetail) {
    exportTypeDetailInput.addEventListener("input", () => updateInvoiceCodeState({ force: true }));
    exportTypeDetailInput.dataset.boundInvoiceDetail = "true";
  }

  const setupExpertSearch = () => {
    if (!expertSearchContainer) return;

    const state =
      expertSearchContainer._expertState || {
        enabled: false,
        results: [],
        selected: null,
      };
    expertSearchContainer._expertState = state;

    const updateSelectionDisplay = () => {
      const hasSelection = Boolean(state.selected);
      if (expertSelectedName instanceof HTMLElement) {
        expertSelectedName.textContent = hasSelection ? state.selected.name : "없음";
      }
      if (expertSelectedValueInput instanceof HTMLInputElement) {
        expertSelectedValueInput.value = hasSelection ? state.selected.name : "";
      }
      if (expertClearButton instanceof HTMLButtonElement) {
        expertClearButton.hidden = !hasSelection;
      }
      expertSearchContainer.dataset.selected = hasSelection ? "true" : "false";
    };

    const clearSelection = ({ silent } = {}) => {
      state.selected = null;
      updateSelectionDisplay();
      if (!silent) {
        updateStepActionState();
      }
    };

    const selectCertificate = (certificate, { silent } = {}) => {
      if (!certificate) return;
      state.selected = certificate;
      updateSelectionDisplay();
      if (expertResultsList instanceof HTMLElement) {
        expertResultsList.hidden = true;
      }
      if (!silent) {
        updateStepActionState();
      }
    };

    const updateSearchButtonState = () => {
      if (!(expertSearchButton instanceof HTMLButtonElement)) return;
      const keyword = (expertKeywordInput instanceof HTMLInputElement ? expertKeywordInput.value : "").trim();
      expertSearchButton.disabled = !state.enabled || keyword.length === 0;
    };

    const showMessage = (message) => {
      if (!(expertResultsList instanceof HTMLElement)) return;
      if (!state.enabled) {
        expertResultsList.innerHTML = "";
        expertResultsList.hidden = true;
        return;
      }
      expertResultsList.innerHTML = `
        <li class="expert-search-empty" role="option" aria-disabled="true">${escapeHtml(message)}</li>
      `;
      expertResultsList.hidden = false;
      state.results = [];
    };

    const renderResults = (items) => {
      if (!(expertResultsList instanceof HTMLElement)) return;
      if (!state.enabled) {
        expertResultsList.innerHTML = "";
        expertResultsList.hidden = true;
        return;
      }
      state.results = items;
      if (!items.length) {
        showMessage("검색 결과가 없습니다.");
        return;
      }
      expertResultsList.innerHTML = items
        .map(
          (item) => `
            <li>
              <button type="button" class="expert-search-option" role="option" data-expert-option data-expert-id="${escapeHtml(
                item.id
              )}">
                <span class="expert-search-option-name">${escapeHtml(item.name)}</span>
                <span class="expert-search-option-desc">${escapeHtml(item.description)}</span>
              </button>
            </li>
          `
        )
        .join("");
      expertResultsList.hidden = false;
    };

    const handleSearch = () => {
      if (!state.enabled) return;
      const keyword = (expertKeywordInput instanceof HTMLInputElement ? expertKeywordInput.value : "").trim().toLowerCase();
      if (!keyword) {
        showMessage("검색어를 입력해주세요.");
        return;
      }
      const results = EXPERT_CERTIFICATES.filter((item) => item.searchValue.includes(keyword));
      if (!results.length) {
        showMessage("검색 결과가 없습니다.");
        return;
      }
      renderResults(results);
    };

    const setEnabled = (enabled) => {
      const nextEnabled = Boolean(enabled);
      expertSearchContainer.dataset.enabled = nextEnabled ? "true" : "false";
      if (state.enabled === nextEnabled) {
        updateSearchButtonState();
        if (!nextEnabled && expertResultsList instanceof HTMLElement) {
          expertResultsList.hidden = true;
        }
        return;
      }
      state.enabled = nextEnabled;
      if (expertKeywordInput instanceof HTMLInputElement) {
        expertKeywordInput.disabled = !state.enabled;
        if (!state.enabled) {
          expertKeywordInput.value = "";
        }
      }
      if (expertSearchButton instanceof HTMLButtonElement) {
        expertSearchButton.disabled = !state.enabled;
      }
      if (!state.enabled) {
        if (expertResultsList instanceof HTMLElement) {
          expertResultsList.innerHTML = "";
          expertResultsList.hidden = true;
        }
        clearSelection({ silent: true });
      }
      updateSearchButtonState();
      updateStepActionState();
    };

    state.clearSelection = clearSelection;
    state.setEnabled = setEnabled;
    state.selectCertificate = selectCertificate;
    state.updateSearchButtonState = updateSearchButtonState;

    if (!expertSearchContainer.dataset.boundExpert) {
      if (expertKeywordInput instanceof HTMLInputElement) {
        expertKeywordInput.addEventListener("input", () => {
          updateSearchButtonState();
        });
        expertKeywordInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSearch();
          }
        });
      }
      if (expertSearchButton instanceof HTMLButtonElement) {
        expertSearchButton.addEventListener("click", handleSearch);
      }
      if (expertResultsList instanceof HTMLElement) {
        expertResultsList.addEventListener("click", (event) => {
          const option = event.target.closest("[data-expert-option]");
          if (!(option instanceof HTMLButtonElement)) return;
          const id = option.dataset.expertId;
          const certificate = id ? EXPERT_CERTIFICATES.find((item) => item.id === id) : null;
          if (certificate) {
            selectCertificate(certificate);
          }
        });
      }
      if (expertClearButton instanceof HTMLButtonElement) {
        expertClearButton.addEventListener("click", () => {
          clearSelection();
          if (expertKeywordInput instanceof HTMLInputElement) {
            expertKeywordInput.focus();
          }
        });
      }
      expertSearchContainer.dataset.boundExpert = "true";
    }

    setEnabled(false);
    clearSelection({ silent: true });
    updateSearchButtonState();
  };

  const syncStrategicDependencies = ({ silent } = {}) => {
    const value = strategicValueInput?.value?.trim() || "";
    const expertState = expertSearchContainer?._expertState;
    const isStrategic = value === "전략물자 수출";
    if (expertState?.setEnabled) {
      expertState.setEnabled(isStrategic);
    } else if (!silent) {
      updateStepActionState();
    }
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
    syncStrategicDependencies({ silent: true });
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
    if (!form.dataset.boundStrategicReset) {
      form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
          if (strategicValueInput) {
            strategicValueInput.value = "";
          }
          syncStrategicDependencies({ silent: true });
        });
      });
      form.dataset.boundStrategicReset = "true";
    }
    syncStrategicDependencies({ silent: true });
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

  const findCountryByName = (name) => {
    if (!name) return undefined;
    return COUNTRY_LIST.find((country) => country.name === name);
  };

  const ensureSimpleCountryOptions = (select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.simpleOptionsLoaded === "true") return;
    const options = COUNTRY_LIST.map((country) => `<option value="${escapeHtml(country.name)}">${escapeHtml(country.name)}</option>`).join("");
    const placeholderOption = select.querySelector('option[value=""]');
    const placeholderHtml = placeholderOption ? placeholderOption.outerHTML : '<option value="">선택</option>';
    select.innerHTML = `${placeholderHtml}${options}`;
    select.dataset.simpleOptionsLoaded = "true";
  };

  const updateSimpleSelectDial = (select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const targetName = select.dataset.codeTarget;
    if (!targetName) return;
    const target = form.querySelector(`[name="${targetName}"]`);
    if (!(target instanceof HTMLInputElement)) return;
    const selectedCountry = findCountryByName(select.value);
    target.value = selectedCountry ? selectedCountry.dialCode : "";
  };

  const setupSimpleCountrySelects = () => {
    if (!simpleCountrySelects.length) return;
    simpleCountrySelects.forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      ensureSimpleCountryOptions(select);
      updateSimpleSelectDial(select);
      if (!select.dataset.boundSimpleCountry) {
        select.addEventListener("change", () => {
          updateSimpleSelectDial(select);
          updateStepActionState();
        });
        form.addEventListener("reset", () => {
          window.requestAnimationFrame(() => {
            updateSimpleSelectDial(select);
            updateStepActionState();
          });
        });
        select.dataset.boundSimpleCountry = "true";
      }
    });
  };

  const setupNotifyCopy = () => {
    if (!notifyCheckbox) return;

    const importerFields = {
      company: form.querySelector('input[name="importCompanyName"]'),
      address: form.querySelector('input[name="importAddress"]'),
      country: form.querySelector('select[name="importCountry"]'),
      countryCode: form.querySelector('input[name="importCountryCode"]'),
      phone: form.querySelector('input[name="importPhone"]'),
      contactName: form.querySelector('input[name="importContactName"]'),
      contactPhone: form.querySelector('input[name="importContactPhone"]'),
      email: form.querySelector('input[name="importEmail"]'),
      etc: form.querySelector('textarea[name="importEtc"]'),
    };

    const notifyFields = {
      company: form.querySelector('input[name="notifyCompanyName"]'),
      address: form.querySelector('input[name="notifyAddress"]'),
      country: form.querySelector('select[name="notifyCountry"]'),
      countryCode: form.querySelector('input[name="notifyCountryCode"]'),
      phone: form.querySelector('input[name="notifyPhone"]'),
      contactName: form.querySelector('input[name="notifyContactName"]'),
      contactPhone: form.querySelector('input[name="notifyContactPhone"]'),
      email: form.querySelector('input[name="notifyEmail"]'),
      etc: form.querySelector('textarea[name="notifyEtc"]'),
    };

    const state = form._notifyCopyState || { suppress: false };
    form._notifyCopyState = state;

    const copyFields = () => {
      state.suppress = true;
      if (notifyFields.company && importerFields.company) notifyFields.company.value = importerFields.company.value;
      if (notifyFields.address && importerFields.address) notifyFields.address.value = importerFields.address.value;
      if (notifyFields.phone && importerFields.phone) notifyFields.phone.value = importerFields.phone.value;
      if (notifyFields.contactName && importerFields.contactName) notifyFields.contactName.value = importerFields.contactName.value;
      if (notifyFields.contactPhone && importerFields.contactPhone) notifyFields.contactPhone.value = importerFields.contactPhone.value;
      if (notifyFields.email && importerFields.email) notifyFields.email.value = importerFields.email.value;
      if (notifyFields.etc && importerFields.etc) notifyFields.etc.value = importerFields.etc.value;

      const importCountryValue = importerFields.country?.value ?? "";
      if (notifyFields.country instanceof HTMLSelectElement) {
        ensureSimpleCountryOptions(notifyFields.country);
        const hasOption = Array.from(notifyFields.country.options).some((option) => option.value === importCountryValue);
        notifyFields.country.value = hasOption ? importCountryValue : "";
        notifyFields.country.dispatchEvent(new Event("change", { bubbles: true }));
        updateSimpleSelectDial(notifyFields.country);
      }
      if (notifyFields.countryCode && importerFields.countryCode) {
        notifyFields.countryCode.value = importerFields.countryCode.value;
      }

      state.suppress = false;
      updateStepActionState();
    };

    state.copyFields = copyFields;

    const handleImporterChange = () => {
      if (!notifyCheckbox.checked) return;
      copyFields();
    };

    const handleNotifyInput = () => {
      if (state.suppress) return;
      if (!notifyCheckbox.checked) return;
      notifyCheckbox.checked = false;
      updateStepActionState();
    };

    if (!state.bound) {
      notifyCheckbox.addEventListener("change", () => {
        if (notifyCheckbox.checked) {
          copyFields();
        }
        updateStepActionState();
      });

      Object.values(importerFields).forEach((field) => {
        if (!field) return;
        field.addEventListener("input", handleImporterChange);
        field.addEventListener("change", handleImporterChange);
      });

      Object.values(notifyFields).forEach((field) => {
        if (!field) return;
        if (field === notifyFields.countryCode) return;
        field.addEventListener("input", handleNotifyInput);
        field.addEventListener("change", handleNotifyInput);
      });

      state.bound = true;
    }

    if (notifyCheckbox.checked) {
      copyFields();
    }
  };

  const setupTransportModeField = () => {
    if (!transportModeSelect || !transportOtherInput) return;
    const toggleDetail = () => {
      const needDetail = transportModeSelect.value === "기타";
      if (transportDetailLabel) {
        if (needDetail) {
          transportDetailLabel.removeAttribute("hidden");
        } else {
          transportDetailLabel.setAttribute("hidden", "true");
        }
      }
      transportOtherInput.disabled = !needDetail;
      transportOtherInput.required = needDetail;
      if (!needDetail) {
        transportOtherInput.value = "";
      }
      updateStepActionState();
    };

    if (!transportModeSelect.dataset.boundTransport) {
      transportModeSelect.addEventListener("change", toggleDetail);
      form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
          toggleDetail();
        });
      });
      transportModeSelect.dataset.boundTransport = "true";
    }

    toggleDetail();
  };

  const setupInlineCalendar = () => {
    const calendars = $$('[data-inline-calendar]', form);
    if (!calendars.length) return;

    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalizeDate = (date) => {
      if (!(date instanceof Date)) return null;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const parseIsoDate = (value) => {
      if (typeof value !== "string" || !value) return null;
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const date = new Date(year, month, day);
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return null;
      }
      return normalizeDate(date);
    };

    const formatIsoDate = (date) => {
      if (!(date instanceof Date)) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const formatMonthLabel = (year, month) => `${year}년 ${month + 1}월`;

    const formatHumanDate = (date) => {
      if (!(date instanceof Date)) return "";
      const weekday = weekdayNames[date.getDay()] ?? "";
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일${weekday ? ` (${weekday})` : ""}`;
    };

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

    calendars.forEach((calendar) => {
      if (!(calendar instanceof HTMLElement)) return;
      const hiddenInput = calendar.querySelector('[data-calendar-input]');
      const grid = calendar.querySelector('[data-calendar-grid]');
      const currentLabel = calendar.querySelector('[data-calendar-current]');
      const selectionLabel = calendar.querySelector('[data-calendar-selection]');
      const prevButton = calendar.querySelector('[data-calendar-prev]');
      const nextButton = calendar.querySelector('[data-calendar-next]');

      if (
        !(hiddenInput instanceof HTMLInputElement) ||
        !(grid instanceof HTMLElement) ||
        !(currentLabel instanceof HTMLElement)
      ) {
        return;
      }

      const state = calendar._inlineCalendarState || {};
      calendar._inlineCalendarState = state;

      const updateSelectionMessage = () => {
        if (!(selectionLabel instanceof HTMLElement)) return;
        if (state.selected instanceof Date) {
          selectionLabel.textContent = `${formatHumanDate(state.selected)}을(를) 선택했습니다.`;
        } else {
          selectionLabel.textContent = "날짜를 선택하세요.";
        }
      };

      const syncStateFromInput = () => {
        const selected = parseIsoDate(hiddenInput.value);
        state.selected = selected;
        if (selected) {
          state.currentYear = selected.getFullYear();
          state.currentMonth = selected.getMonth();
          state.focusDate = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return;
        }

        if (typeof state.currentYear !== "number" || typeof state.currentMonth !== "number") {
          state.currentYear = today.getFullYear();
          state.currentMonth = today.getMonth();
        }

        const focusDay = state.focusDate instanceof Date ? state.focusDate.getDate() : today.getDate();
        const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
        state.focusDate = new Date(
          state.currentYear,
          state.currentMonth,
          Math.min(Math.max(focusDay, 1), daysInMonth)
        );
      };

      const renderCalendar = ({ focus } = {}) => {
        if (!(grid instanceof HTMLElement) || typeof state.currentYear !== "number" || typeof state.currentMonth !== "number") {
          return;
        }
        const firstOfMonth = new Date(state.currentYear, state.currentMonth, 1);
        const startOffset = firstOfMonth.getDay();
        const startDate = new Date(firstOfMonth);
        startDate.setDate(firstOfMonth.getDate() - startOffset);

        const todayKey = formatIsoDate(today);
        const selectedKey = state.selected instanceof Date ? formatIsoDate(state.selected) : null;
        const focusKey = state.focusDate instanceof Date ? formatIsoDate(state.focusDate) : null;

        const days = [];
        for (let index = 0; index < 42; index += 1) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + index);
          days.push(date);
        }

        grid.innerHTML = days
          .map((date) => {
            const iso = formatIsoDate(date);
            const isOutside = date.getMonth() !== state.currentMonth;
            const isToday = iso === todayKey;
            const isSelected = !!selectedKey && iso === selectedKey;
            const isFocused = !!focusKey && iso === focusKey;
            const classes = ["inline-calendar-day"];
            if (isOutside) classes.push("is-outside");
            if (isToday) classes.push("is-today");
            if (isSelected) classes.push("is-selected");
            const ariaSelected = isSelected ? "true" : "false";
            const tabIndex = isFocused ? "0" : "-1";
            const outsideAttr = isOutside ? ' data-outside="true"' : "";
            return `
              <button
                type="button"
                class="${classes.join(" ")}"
                data-calendar-date="${iso}"
                role="gridcell"
                aria-selected="${ariaSelected}"
                tabindex="${tabIndex}"
                aria-label="${formatHumanDate(date)}"
                ${outsideAttr}
              >
                ${date.getDate()}
              </button>
            `;
          })
          .join("");

        currentLabel.textContent = formatMonthLabel(state.currentYear, state.currentMonth);
        updateSelectionMessage();

        if (focus) {
          const focusEl = grid.querySelector('[tabindex="0"]');
          if (focusEl instanceof HTMLElement) {
            focusEl.focus();
          }
        }
      };

      const setCurrentMonth = (year, month, { preserveFocus = false } = {}) => {
        const next = new Date(year, month, 1);
        state.currentYear = next.getFullYear();
        state.currentMonth = next.getMonth();
        const focusDay = preserveFocus && state.focusDate instanceof Date ? state.focusDate.getDate() : 1;
        const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
        state.focusDate = new Date(
          state.currentYear,
          state.currentMonth,
          Math.min(Math.max(focusDay, 1), daysInMonth)
        );
        renderCalendar({ focus: true });
      };

      const selectDate = (date, { focus = true } = {}) => {
        const normalized = normalizeDate(date);
        if (!normalized) return;
        state.selected = normalized;
        state.currentYear = normalized.getFullYear();
        state.currentMonth = normalized.getMonth();
        state.focusDate = new Date(normalized);
        hiddenInput.value = formatIsoDate(normalized);
        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
        renderCalendar({ focus });
        updateStepActionState();
      };

      const moveFocusByDays = (offset) => {
        const base = state.focusDate instanceof Date
          ? state.focusDate
          : new Date(state.currentYear, state.currentMonth, 1);
        const next = new Date(base);
        next.setDate(base.getDate() + offset);
        state.focusDate = normalizeDate(next);
        state.currentYear = state.focusDate.getFullYear();
        state.currentMonth = state.focusDate.getMonth();
        renderCalendar({ focus: true });
      };

      const moveFocusToWeekBoundary = (position) => {
        if (!(state.focusDate instanceof Date)) {
          moveFocusByDays(0);
          return;
        }
        const day = state.focusDate.getDay();
        const offset = position === "start" ? -day : 6 - day;
        moveFocusByDays(offset);
      };

      const moveFocusByMonths = (offset) => {
        const base = state.focusDate instanceof Date
          ? state.focusDate
          : new Date(state.currentYear, state.currentMonth, 1);
        const next = new Date(base);
        next.setMonth(base.getMonth() + offset);
        state.focusDate = normalizeDate(next);
        state.currentYear = state.focusDate.getFullYear();
        state.currentMonth = state.focusDate.getMonth();
        renderCalendar({ focus: true });
      };

      const handleGridKeydown = (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest('[data-calendar-date]') : null;
        if (!target) return;
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            moveFocusByDays(-7);
            break;
          case "ArrowDown":
            event.preventDefault();
            moveFocusByDays(7);
            break;
          case "ArrowLeft":
            event.preventDefault();
            moveFocusByDays(-1);
            break;
          case "ArrowRight":
            event.preventDefault();
            moveFocusByDays(1);
            break;
          case "Home":
            event.preventDefault();
            moveFocusToWeekBoundary("start");
            break;
          case "End":
            event.preventDefault();
            moveFocusToWeekBoundary("end");
            break;
          case "PageUp":
            event.preventDefault();
            moveFocusByMonths(event.shiftKey ? -12 : -1);
            break;
          case "PageDown":
            event.preventDefault();
            moveFocusByMonths(event.shiftKey ? 12 : 1);
            break;
          case "Enter":
          case " ":
            event.preventDefault();
            {
              const iso = target.dataset.calendarDate;
              const date = parseIsoDate(iso);
              if (date) {
                selectDate(date, { focus: true });
              }
            }
            break;
          default:
            break;
        }
      };

      if (!calendar.dataset.boundInlineCalendar) {
        grid.addEventListener("click", (event) => {
          const button = event.target instanceof HTMLElement ? event.target.closest('[data-calendar-date]') : null;
          if (!button) return;
          const date = parseIsoDate(button.dataset.calendarDate || "");
          if (date) {
            selectDate(date, { focus: true });
          }
        });
        grid.addEventListener("keydown", handleGridKeydown);
        if (prevButton instanceof HTMLButtonElement) {
          prevButton.addEventListener("click", () => {
            setCurrentMonth(state.currentYear, state.currentMonth - 1, { preserveFocus: true });
          });
        }
        if (nextButton instanceof HTMLButtonElement) {
          nextButton.addEventListener("click", () => {
            setCurrentMonth(state.currentYear, state.currentMonth + 1, { preserveFocus: true });
          });
        }
        form.addEventListener("reset", () => {
          window.requestAnimationFrame(() => {
            hiddenInput.value = "";
            state.selected = null;
            state.currentYear = today.getFullYear();
            state.currentMonth = today.getMonth();
            state.focusDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            renderCalendar();
            updateStepActionState();
          });
        });
        calendar.dataset.boundInlineCalendar = "true";
      }

      syncStateFromInput();
      renderCalendar();
      updateStepActionState();
    });
  };

  const setupIncotermsField = () => {
    if (!incotermsSelect || !incotermsOtherInput) return;
    const toggleDetail = () => {
      const needDetail = incotermsSelect.value === "기타";
      if (incotermsDetailLabel) {
        if (needDetail) {
          incotermsDetailLabel.removeAttribute("hidden");
        } else {
          incotermsDetailLabel.setAttribute("hidden", "true");
        }
      }
      incotermsOtherInput.disabled = !needDetail;
      incotermsOtherInput.required = needDetail;
      if (!needDetail) {
        incotermsOtherInput.value = "";
      }
      updateStepActionState();
    };

    if (!incotermsSelect.dataset.boundIncoterms) {
      incotermsSelect.addEventListener("change", toggleDetail);
      form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
          toggleDetail();
        });
      });
      incotermsSelect.dataset.boundIncoterms = "true";
    }

    toggleDetail();
  };

  const setupItemTable = () => {
    if (!itemsStep || !itemRows) return;

    const state = form._itemTableState || {};
    form._itemTableState = state;
    if (typeof state.rowIdCounter !== "number") {
      state.rowIdCounter = 0;
    }

    const itemSummaryContainer = itemsStep.querySelector('[data-item-summary]');
    const itemQtySumEl = itemsStep.querySelector('[data-item-qty-sum]');
    const itemTotalSumEl = itemsStep.querySelector('[data-item-total-sum]');
    const itemTotalCurrencyEl = itemsStep.querySelector('[data-item-total-currency]');
    const qtyFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
    const amountFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

    const getNumericValue = (input) => {
      if (!(input instanceof HTMLInputElement)) return null;
      const raw = (input.value ?? '').trim();
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };

    const formatAmountValue = (value) => {
      if (!Number.isFinite(value)) return '';
      const fixed = value.toFixed(2);
      return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    };

    const assignRowKey = (row) => {
      if (!row) return;
      if (!row.dataset.itemKey) {
        state.rowIdCounter += 1;
        row.dataset.itemKey = `item-${state.rowIdCounter}`;
      }
    };

    const getRowCurrency = (row) => {
      if (!row) return '';
      const select = row.querySelector('select[name="itemCurrency"]');
      if (!(select instanceof HTMLSelectElement)) return '';
      return (select.value || '').trim();
    };

    const updateRowCurrencyLabels = (row) => {
      if (!row) return;
      const currency = getRowCurrency(row) || '-';
      const unitCurrency = row.querySelector('[data-item-unit-currency]');
      const totalCurrency = row.querySelector('[data-item-total-currency]');
      if (unitCurrency instanceof HTMLElement) {
        unitCurrency.textContent = currency;
      }
      if (totalCurrency instanceof HTMLElement) {
        totalCurrency.textContent = currency;
      }
    };

    const createRow = () => {
      const row = document.createElement("tr");
      row.setAttribute("data-item-row", "");
      assignRowKey(row);
      row.innerHTML = `
        <td class="item-cell-select"><input type="checkbox" data-item-select aria-label="행 선택" /></td>
        <td class="item-cell-no">
          <span data-item-no-display>1</span>
          <input type="hidden" name="itemNo" data-item-input data-item-no />
        </td>
        <td><input type="text" name="itemName" data-item-input required placeholder="예: 품명" /></td>
        <td><input type="text" name="itemCategory" data-item-input required placeholder="예: 품목구분" /></td>
        <td><input type="number" name="itemQuantity" data-item-input required min="0" step="1" placeholder="예: 10" /></td>
        <td>
          <select name="itemCurrency" data-item-input required>
            ${ITEM_CURRENCY_OPTIONS_HTML}
          </select>
        </td>
        <td>
          <div class="item-amount-field">
            <input type="number" name="itemUnitPrice" data-item-input required min="0" step="0.01" placeholder="예: 1200" />
            <span class="item-currency-label" data-item-unit-currency>-</span>
          </div>
        </td>
        <td>
          <div class="item-amount-field">
            <input
              type="number"
              name="itemTotal"
              data-item-input
              data-item-total
              required
              min="0"
              step="0.01"
              placeholder="예: 12000"
              readonly
              aria-readonly="true"
              tabindex="-1"
            />
            <span class="item-currency-label" data-item-total-currency>-</span>
          </div>
        </td>
        <td>
          <div class="item-origin-field">
            <select name="itemOrigin" data-item-input required data-item-origin-select>
              ${ITEM_ORIGIN_OPTIONS_HTML}
            </select>
            <input type="text" name="itemOriginOther" data-item-origin-other data-item-input placeholder="생산국을 입력하세요" hidden disabled />
          </div>
        </td>
      `;
      return row;
    };

    const setupOriginField = (row) => {
      const originSelect = row.querySelector('[data-item-origin-select]');
      const originOtherInput = row.querySelector('[data-item-origin-other]');
      if (!(originSelect instanceof HTMLSelectElement) || !(originOtherInput instanceof HTMLInputElement)) {
        return;
      }

      const syncOriginField = () => {
        const needCustom = originSelect.value === "기타";
        originOtherInput.hidden = !needCustom;
        originOtherInput.disabled = !needCustom;
        originOtherInput.required = needCustom;
        if (!needCustom) {
          originOtherInput.value = "";
        }
        updateStepActionState();
      };

      if (!originSelect.dataset.boundOrigin) {
        originSelect.addEventListener("change", syncOriginField);
        originSelect.dataset.boundOrigin = "true";
      }

      if (!originSelect.value) {
        originSelect.selectedIndex = 0;
      }
      syncOriginField();
    };

    const updateRowTotal = (row) => {
      updateRowCurrencyLabels(row);
      const quantityInput = row.querySelector('input[name="itemQuantity"]');
      const unitPriceInput = row.querySelector('input[name="itemUnitPrice"]');
      const totalInput = row.querySelector('input[name="itemTotal"]');
      if (!(totalInput instanceof HTMLInputElement)) return;
      const quantityValue = getNumericValue(quantityInput);
      const unitPriceValue = getNumericValue(unitPriceInput);
      if (quantityValue === null || unitPriceValue === null) {
        totalInput.value = '';
        return;
      }
      const total = Math.round(quantityValue * unitPriceValue * 100) / 100;
      totalInput.value = formatAmountValue(total);
    };

    const updateItemSummary = () => {
      if (!(itemQtySumEl instanceof HTMLElement) || !(itemTotalSumEl instanceof HTMLElement)) return;
      const rows = $$('[data-item-row]', itemRows);
      let quantitySum = 0;
      let amountSum = 0;
      const currencyCodes = new Set();
      rows.forEach((row) => {
        const qtyInput = row.querySelector('input[name="itemQuantity"]');
        const totalInput = row.querySelector('input[name="itemTotal"]');
        updateRowTotal(row);
        const qtyValue = getNumericValue(qtyInput);
        const totalValue = getNumericValue(totalInput);
        if (qtyValue !== null) {
          quantitySum += qtyValue;
        }
        if (totalValue !== null) {
          amountSum += totalValue;
        }
        const currency = getRowCurrency(row);
        if (currency) {
          currencyCodes.add(currency);
        }
      });
      itemQtySumEl.textContent = qtyFormatter.format(quantitySum);
      itemTotalSumEl.textContent = amountFormatter.format(amountSum);
      if (itemTotalCurrencyEl instanceof HTMLElement) {
        if (currencyCodes.size === 1) {
          itemTotalCurrencyEl.textContent = currencyCodes.values().next().value;
        } else if (currencyCodes.size > 1) {
          itemTotalCurrencyEl.textContent = '다중 통화';
        } else {
          itemTotalCurrencyEl.textContent = '-';
        }
      }
      if (itemSummaryContainer instanceof HTMLElement) {
        itemSummaryContainer.dataset.empty = rows.length ? "false" : "true";
      }
    };

    const updateRowNumbers = () => {
      const rows = $$('[data-item-row]', itemRows);
      rows.forEach((row, idx) => {
        const display = row.querySelector('[data-item-no-display]');
        const preset = row.dataset.itemNoPreset;
        if (display) {
          display.textContent = preset ? preset : String(idx + 1);
        }
        const hiddenInput = row.querySelector('input[name="itemNo"]');
        if (hiddenInput instanceof HTMLInputElement) {
          hiddenInput.value = preset ? preset : String(idx + 1);
        }
      });
    };

    const addRow = () => {
      const row = createRow();
      itemRows.appendChild(row);
      setupOriginField(row);
      updateRowNumbers();
      updateRowTotal(row);
      updateItemSummary();
      updateStepActionState();
    };

    const resetRows = () => {
      itemRows.innerHTML = "";
      addRow();
    };

    const removeSelectedRows = () => {
      const rows = $$('[data-item-row]', itemRows);
      const selectedRows = rows.filter((row) => row.querySelector('[data-item-select]')?.checked);
      if (!selectedRows.length) {
        alert("삭제할 행을 선택해주세요.");
        return;
      }
      selectedRows.forEach((row) => row.remove());
      if (!itemRows.children.length) {
        addRow();
      } else {
        updateRowNumbers();
        updateItemSummary();
        updateStepActionState();
      }
    };

    const setRows = (items = []) => {
      if (!itemRows) return;
      const list = Array.isArray(items) ? items : [];
      itemRows.innerHTML = "";
      if (!list.length) {
        resetRows();
        return;
      }
      list.forEach((item, index) => {
        const row = createRow();
        itemRows.appendChild(row);
        if (item && typeof item === "object") {
          if (item.id !== undefined && item.id !== null) {
            row.dataset.itemKey = String(item.id);
          }
          if (item.no !== undefined && item.no !== null && item.no !== "") {
            row.dataset.itemNoPreset = String(item.no);
          } else {
            delete row.dataset.itemNoPreset;
          }
          const setValue = (selector, value) => {
            const el = row.querySelector(selector);
            if (!el) return;
            const normalized = value === undefined || value === null ? "" : String(value);
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              el.value = normalized;
            } else if (el instanceof HTMLSelectElement) {
              el.value = normalized;
            }
          };
          setValue('input[name="itemName"]', item.name);
          setValue('input[name="itemCategory"]', item.category);
          setValue('input[name="itemQuantity"]', item.quantity);
          setValue('input[name="itemUnitPrice"]', item.unitPrice);
          setValue('input[name="itemTotal"]', item.total);
          setValue('input[name="itemNo"]', item.no ?? index + 1);
          const displayNo = row.querySelector('[data-item-no-display]');
          if (displayNo) {
            if (item.no !== undefined && item.no !== null && item.no !== "") {
              displayNo.textContent = String(item.no);
            }
          }
          const currencySelect = row.querySelector('select[name="itemCurrency"]');
          if (currencySelect instanceof HTMLSelectElement) {
            currencySelect.value = item.currency === undefined || item.currency === null ? "" : String(item.currency);
          }
          const originSelect = row.querySelector('[data-item-origin-select]');
          const originOtherInput = row.querySelector('[data-item-origin-other]');
          const originValue = item.origin ?? "";
          const originData = resolveCountryData(originValue);
          const normalizedOrigin = originData?.name ?? (typeof originValue === "string" ? originValue : "");
          if (originSelect instanceof HTMLSelectElement) {
            const hasOption = Array.from(originSelect.options).some((option) => option.value === normalizedOrigin);
            if (hasOption) {
              originSelect.value = normalizedOrigin;
              if (originOtherInput instanceof HTMLInputElement) {
                originOtherInput.value = "";
              }
            } else if (normalizedOrigin) {
              originSelect.value = "기타";
              if (originOtherInput instanceof HTMLInputElement) {
                originOtherInput.value = normalizedOrigin;
              }
            } else {
              originSelect.value = "";
              if (originOtherInput instanceof HTMLInputElement) {
                originOtherInput.value = "";
              }
            }
          }
          if (originOtherInput instanceof HTMLInputElement && item.originOther) {
            originOtherInput.value = String(item.originOther);
          }
        }
        setupOriginField(row);
        updateRowCurrencyLabels(row);
        updateRowTotal(row);
      });
      updateRowNumbers();
      updateItemSummary();
      updateStepActionState();
    };

    state.setRows = (items) => setRows(items);

    if (!state.bound) {
      addItemButton?.addEventListener("click", () => {
        addRow();
      });
      removeItemButton?.addEventListener("click", () => {
        removeSelectedRows();
      });
      const handleItemChange = (event) => {
        const target = event.target;
        const row = target instanceof HTMLElement ? target.closest('[data-item-row]') : null;
        if (row) {
          updateRowTotal(row);
        }
        updateItemSummary();
        updateStepActionState();
      };
      itemRows.addEventListener("input", handleItemChange);
      itemRows.addEventListener("change", handleItemChange);
      form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
          resetRows();
          updateItemSummary();
          updateStepActionState();
        });
      });
      state.bound = true;
    }

    if (!state.initialized) {
      resetRows();
      state.initialized = true;
    } else if (!itemRows.children.length) {
      resetRows();
    } else {
      const rows = $$('[data-item-row]', itemRows);
      rows.forEach((row) => {
        assignRowKey(row);
        setupOriginField(row);
      });
      updateRowNumbers();
      updateItemSummary();
      updateStepActionState();
    }
    updateItemSummary();
  };

  const setupPackingStep = () => {
    const packingStep = form.querySelector('[data-packing-step]');
    if (!packingStep) return;

    const state = form._packingState || {};
    if (!Array.isArray(state.boxes)) {
      state.boxes = [];
    }
    if (!Array.isArray(state.items)) {
      state.items = [];
    }
    if (!(state.remainders instanceof Map)) {
      state.remainders = new Map();
    }
    if (typeof state.formOpen !== 'boolean') {
      state.formOpen = false;
    }
    state.activeAssignment = state.activeAssignment || null;

    state.boxes = state.boxes.map((box, index) => {
      const boxId = box?.boxId || box?.id || `box-${index + 1}`;
      const dimensions = {
        L: Number(box?.dimensions?.L ?? box?.length) || 0,
        W: Number(box?.dimensions?.W ?? box?.width) || 0,
        H: Number(box?.dimensions?.H ?? box?.height) || 0,
        CBM: Number(box?.dimensions?.CBM ?? box?.cbm) || 0,
      };
      const weightKg = Number(box?.weightKg ?? box?.weight) || 0;
      const contents = Array.isArray(box?.contents)
        ? box.contents
            .map((content) => ({
              itemId: content?.itemId || content?.key || content?.id || '',
              qty: Math.max(0, Math.floor(Number(content?.qty) || 0)),
            }))
            .filter((content) => content.itemId)
        : [];
      return {
        boxId,
        name: box?.name || `Packing ${String(index + 1).padStart(2, '0')}`,
        dimensions,
        weightKg,
        contents,
      };
    });

    form._packingState = state;

    const quantityFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
    const itemRowsRoot = form.querySelector('[data-item-rows]');
    const packingList = packingStep.querySelector('[data-packing-list]');
    const packingEmpty = packingStep.querySelector('[data-packing-empty]');
    const packingItemsBody = packingStep.querySelector('[data-packing-items-body]');
    const packingItemsEmpty = packingStep.querySelector('[data-packing-items-empty]');
    const openButton = packingStep.querySelector('[data-packing-open]');
    const createButton = packingStep.querySelector('[data-packing-create]');
    const panel = packingStep.querySelector('[data-packing-panel]');
    const closeButton = packingStep.querySelector('[data-packing-close]');
    const cancelButton = packingStep.querySelector('[data-packing-cancel]');
    const inputs = {
      name: packingStep.querySelector('[data-packing-field="name"]'),
      length: packingStep.querySelector('[data-packing-field="length"]'),
      width: packingStep.querySelector('[data-packing-field="width"]'),
      height: packingStep.querySelector('[data-packing-field="height"]'),
      cbm: packingStep.querySelector('[data-packing-field="cbm"]'),
      weight: packingStep.querySelector('[data-packing-field="weight"]'),
    };

    const assignDialog = $('#packingAssignDialog');
    const assignForm = assignDialog?.querySelector('[data-packing-assign-form]');
    const assignSubtitle = assignDialog?.querySelector('[data-packing-assign-subtitle]');
    const assignRemainLabel = assignDialog?.querySelector('[data-packing-assign-remain]');
    const assignQtyInput = assignDialog?.querySelector('[data-packing-assign-qty]');
    const assignError = assignDialog?.querySelector('[data-packing-assign-error]');
    const assignCancel = assignDialog?.querySelector('[data-packing-assign-cancel]');
    const assignConfirm = assignDialog?.querySelector('[data-packing-assign-confirm]');

    let draggingItemId = null;

    const formatNumber = (value, decimals = 0) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return '0';
      const formatter = new Intl.NumberFormat('ko-KR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return formatter.format(numeric);
    };

    const ensureDefaultName = () => {
      if (!(inputs.name instanceof HTMLInputElement)) return;
      if ((inputs.name.value || '').trim() === '') {
        const nextIndex = state.boxes.length + 1;
        inputs.name.value = `Packing ${String(nextIndex).padStart(2, '0')}`;
      }
    };

    const syncFormVisibility = () => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = !state.formOpen;
      if (openButton instanceof HTMLButtonElement) {
        openButton.hidden = state.formOpen;
      }
    };

    const getNumericValue = (input) => {
      if (!(input instanceof HTMLInputElement)) return 0;
      const value = Number(input.value);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    };

    const computeCbmValue = (length, width, height) => {
      const product = length * width * height;
      if (!Number.isFinite(product) || product <= 0) {
        return 0;
      }
      return product / 1_000_000;
    };

    const readDimensions = () => {
      const length = getNumericValue(inputs.length);
      const width = getNumericValue(inputs.width);
      const height = getNumericValue(inputs.height);
      const cbm = computeCbmValue(length, width, height);
      return { length, width, height, cbm };
    };

    const updateCbmField = () => {
      if (!(inputs.cbm instanceof HTMLInputElement)) return;
      const { length, width, height, cbm } = readDimensions();
      if (length > 0 && width > 0 && height > 0 && cbm > 0) {
        inputs.cbm.value = cbm.toFixed(3);
      } else {
        inputs.cbm.value = '';
      }
    };

    const gatherItems = () => {
      const rows = itemRowsRoot ? $$('[data-item-row]', itemRowsRoot) : [];
      return rows
        .map((row, index) => {
          const id = row.dataset.itemKey || `row-${index}`;
          const getValue = (selector) => {
            const el = row.querySelector(selector);
            return el && 'value' in el ? String(el.value).trim() : '';
          };
          const qtyValue = Number(getValue('input[name="itemQuantity"]'));
          const totalQty = Number.isFinite(qtyValue) && qtyValue > 0 ? Math.floor(qtyValue) : 0;
          const name = getValue('input[name="itemName"]');
          const kind = getValue('input[name="itemCategory"]');
          const no = getValue('input[name="itemNo"]');
          if (!name && !kind && !no && totalQty <= 0) {
            return null;
          }
          return {
            id,
            no,
            name,
            kind,
            totalQty,
          };
        })
        .filter(Boolean);
    };

    const syncItemsFromForm = () => {
      state.items = gatherItems();
      const itemMap = new Map(state.items.map((item) => [item.id, item]));
      const remainingMap = new Map(state.items.map((item) => [item.id, item.totalQty]));
      state.boxes.forEach((box) => {
        const nextContents = [];
        box.contents = Array.isArray(box.contents) ? box.contents : [];
        box.contents.forEach((content) => {
          const item = itemMap.get(content.itemId);
          if (!item) return;
          const currentRemaining = remainingMap.get(content.itemId) ?? 0;
          const qty = Math.max(0, Math.min(Math.floor(Number(content.qty) || 0), currentRemaining));
          if (qty > 0) {
            nextContents.push({ itemId: content.itemId, qty });
            remainingMap.set(content.itemId, currentRemaining - qty);
          }
        });
        box.contents = nextContents;
      });
    };

    const computeRemainders = () => {
      const remainders = new Map(state.items.map((item) => [item.id, item.totalQty]));
      state.boxes.forEach((box) => {
        (box.contents || []).forEach((content) => {
          if (!remainders.has(content.itemId)) return;
          const current = remainders.get(content.itemId) ?? 0;
          const nextValue = Math.max(0, current - Math.max(0, Math.floor(Number(content.qty) || 0)));
          remainders.set(content.itemId, nextValue);
        });
      });
      return remainders;
    };

    const hasItemsToPack = () => state.items.some((item) => item.totalQty > 0);

    const canCompletePacking = () => {
      if (!state.boxes.length) return false;
      if (!hasItemsToPack()) return false;
      return state.items.every((item) => {
        if (item.totalQty <= 0) return true;
        const remain = state.remainders.get(item.id) ?? item.totalQty;
        return remain === 0;
      });
    };

    const updateCompletionHint = () => {
      if (!(completeButton instanceof HTMLButtonElement)) return;
      let reason = '';
      if (!state.boxes.length) {
        reason = '먼저 패킹을 추가해 주세요.';
      } else if (!hasItemsToPack()) {
        reason = '팩킹할 품목의 수량을 입력해주세요.';
      } else if (!canCompletePacking()) {
        reason = '잔량이 남아 있어 완료할 수 없습니다.';
      }
      if (reason) {
        completeButton.title = reason;
        completeButton.dataset.packingReason = reason;
      } else {
        completeButton.removeAttribute('title');
        delete completeButton.dataset.packingReason;
      }
    };

    const updateItemsEmptyState = () => {
      if (!(packingItemsEmpty instanceof HTMLElement)) return;
      packingItemsEmpty.hidden = state.items.length > 0;
    };

    const renderItemTable = () => {
      if (!(packingItemsBody instanceof HTMLElement)) return;
      updateItemsEmptyState();
      if (!state.items.length) {
        packingItemsBody.innerHTML = '';
        return;
      }
      const rowsHtml = state.items
        .map((item) => {
          const remain = state.remainders.get(item.id) ?? item.totalQty;
          const disabled = remain <= 0 || !state.boxes.length;
          return `
        <tr class=\"packing-item-row\" data-packing-item-row data-item-id=\"${escapeHtml(item.id)}\"${
            disabled ? ' data-disabled=\"true\"' : ''
          }>
          <td class=\"packing-item-no\">${escapeHtml(item.no || '')}</td>
          <td><span class=\"packing-item-name\">${escapeHtml(item.name || '-')}</span></td>
          <td>${escapeHtml(item.kind || '-')}</td>
          <td class=\"packing-item-remainder\">${escapeHtml(quantityFormatter.format(remain))}</td>
        </tr>
      `;
        })
        .join('');
      packingItemsBody.innerHTML = rowsHtml;
      const rows = $$('[data-packing-item-row]', packingItemsBody);
      rows.forEach((row) => {
        const disabled = row.dataset.disabled === 'true';
        row.draggable = !disabled;
      });
    };

    const formatMetaTag = (label, value, { decimals = 0, unit = '' } = {}) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        const suffix = unit ? ` ${unit}` : '';
        return `<span class=\"packing-card-tag\">${escapeHtml(label)} ${escapeHtml(
          formatNumber(numeric, decimals) + suffix
        )}</span>`;
      }
      return `<span class=\"packing-card-tag\" data-empty=\"true\">${escapeHtml(label)} 미입력</span>`;
    };

    const renderBoxes = () => {
      if (!(packingList instanceof HTMLElement)) return;
      const itemsMap = new Map(state.items.map((item) => [item.id, item]));
      if (packingEmpty instanceof HTMLElement) {
        packingEmpty.hidden = state.boxes.length > 0;
      }
      if (!state.boxes.length) {
        packingList.innerHTML = '';
        return;
      }
      packingList.innerHTML = state.boxes
        .map((box) => {
          const contents = Array.isArray(box.contents) ? box.contents : [];
          const normalizedContents = contents
            .map((content) => {
              const item = itemsMap.get(content.itemId);
              const qty = Math.max(0, Math.floor(Number(content.qty) || 0));
              return item ? { item, qty } : null;
            })
            .filter(Boolean);
          const totalQty = normalizedContents.reduce((sum, entry) => sum + entry.qty, 0);
          const itemCount = normalizedContents.length;
          const metaTags = [
            formatMetaTag('L', box.dimensions?.L ?? 0, { decimals: 2, unit: 'cm' }),
            formatMetaTag('W', box.dimensions?.W ?? 0, { decimals: 2, unit: 'cm' }),
            formatMetaTag('H', box.dimensions?.H ?? 0, { decimals: 2, unit: 'cm' }),
            formatMetaTag('CBM', box.dimensions?.CBM ?? 0, { decimals: 3 }),
            formatMetaTag('무게', box.weightKg ?? 0, { decimals: 2, unit: 'kg' }),
          ].join('');
          const contentsHtml = normalizedContents
            .map(({ item, qty }) => {
              const kindMeta = item.kind ? `<span class=\"packing-card-item-meta\">${escapeHtml(item.kind)}</span>` : '';
              return `
          <li class=\"packing-card-item\" data-box-item data-box-id=\"${escapeHtml(box.boxId)}\" data-item-id=\"${escapeHtml(
                item.id
              )}\">
            <div>
              <div class=\"packing-card-item-name\">${escapeHtml(item.name || '-')}</div>
              ${kindMeta}
            </div>
            <div class=\"packing-card-item-right\">
              <span class=\"packing-card-item-qty\">${escapeHtml(quantityFormatter.format(qty))}</span>
              <div class=\"packing-card-item-actions\">
                <button type=\"button\" class=\"icon-btn\" data-box-content-edit data-box-id=\"${escapeHtml(
                  box.boxId
                )}\" data-item-id=\"${escapeHtml(item.id)}\" aria-label=\"수량 편집\">✎</button>
                <button type=\"button\" class=\"icon-btn\" data-box-content-remove data-box-id=\"${escapeHtml(
                  box.boxId
                )}\" data-item-id=\"${escapeHtml(item.id)}\" aria-label=\"배정 삭제\">🗑</button>
              </div>
            </div>
          </li>
        `;
            })
            .join('');
          return `
        <li class=\"packing-card\" data-box-id=\"${escapeHtml(box.boxId)}\" data-empty=\"${
            normalizedContents.length ? 'false' : 'true'
          }\">
          <button type=\"button\" class=\"packing-card-delete\" data-packing-delete data-box-id=\"${escapeHtml(
            box.boxId
          )}\" aria-label=\"패킹 삭제\">✕</button>
          <div class=\"packing-card-title\">${escapeHtml(box.name)}</div>
          <div class=\"packing-card-meta\">${metaTags}</div>
          <div class=\"packing-card-summary\">
            <span>품목 ${escapeHtml(String(itemCount))}개</span>
            <span>총 수량 ${escapeHtml(quantityFormatter.format(totalQty))}</span>
          </div>
          <p class=\"packing-card-empty\">담긴 품목 없음</p>
          <ul class=\"packing-card-contents\">${contentsHtml}</ul>
        </li>
      `;
        })
        .join('');
    };

    const rerender = ({ updateItems = false } = {}) => {
      if (updateItems) {
        syncItemsFromForm();
      }
      state.remainders = computeRemainders();
      state.getRemainders = () => new Map(state.remainders);
      state.canComplete = () => canCompletePacking();
      renderBoxes();
      renderItemTable();
      updateCompletionHint();
      updateStepActionState();
    };

    const applyVisibility = (isActive) => {
      packingStep.dataset.packingVisible = isActive ? 'true' : 'false';
      if (isActive) {
        packingStep.removeAttribute('aria-hidden');
      } else {
        packingStep.setAttribute('aria-hidden', 'true');
      }
      if (typeof packingStep.toggleAttribute === 'function') {
        packingStep.toggleAttribute('inert', !isActive);
      }
    };

    const openForm = ({ focusInput = true } = {}) => {
      state.formOpen = true;
      syncFormVisibility();
      ensureDefaultName();
      updateCbmField();
      if (focusInput && inputs.name instanceof HTMLInputElement) {
        inputs.name.focus();
      }
    };

    const closeForm = ({ resetFields = false, focusTrigger = false } = {}) => {
      state.formOpen = false;
      if (resetFields) {
        Object.values(inputs).forEach((input) => {
          if (input instanceof HTMLInputElement) {
            input.value = '';
          }
        });
        updateCbmField();
      }
      syncFormVisibility();
      ensureDefaultName();
      if (focusTrigger && openButton instanceof HTMLButtonElement) {
        openButton.focus();
      }
    };

    const handleCreate = () => {
      const nameValue = inputs.name instanceof HTMLInputElement ? inputs.name.value.trim() : '';
      const { length, width, height, cbm } = readDimensions();
      const normalizedCbm = cbm > 0 ? Number(cbm.toFixed(3)) : 0;
      const box = {
        boxId: `box-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: nameValue || `Packing ${String(state.boxes.length + 1).padStart(2, '0')}`,
        dimensions: {
          L: length,
          W: width,
          H: height,
          CBM: normalizedCbm,
        },
        weightKg: getNumericValue(inputs.weight),
        contents: [],
      };
      state.boxes.push(box);
      closeForm({ resetFields: true, focusTrigger: true });
      ensureDefaultName();
      rerender();
    };

    const handleDeleteBox = (boxId) => {
      if (!boxId) return;
      if (!window.confirm('해당 패킹을 삭제하시겠습니까?')) return;
      state.boxes = state.boxes.filter((box) => box.boxId !== boxId);
      rerender();
      ensureDefaultName();
    };

    const handleRemoveContent = (boxId, itemId) => {
      if (!boxId || !itemId) return;
      const box = state.boxes.find((entry) => entry.boxId === boxId);
      if (!box) return;
      box.contents = box.contents.filter((content) => content.itemId !== itemId);
      rerender();
    };

    const clearDroppableState = () => {
      if (!(packingList instanceof HTMLElement)) return;
      $$('[data-box-id]', packingList).forEach((card) => card.removeAttribute('data-droppable'));
    };

    const closeAssignDialog = () => {
      state.activeAssignment = null;
      if (assignQtyInput instanceof HTMLInputElement) {
        assignQtyInput.value = '';
      }
      if (assignDialog instanceof HTMLDialogElement && assignDialog.open) {
        assignDialog.close();
      }
    };

    const openAssignDialog = ({ itemId, boxId = null, mode = 'create' }) => {
      if (!(assignDialog instanceof HTMLDialogElement)) return;
      const item = state.items.find((entry) => entry.id === itemId);
      if (!item) {
        alert('존재하지 않는 품목입니다.');
        return;
      }
      if (!state.boxes.length) {
        alert('먼저 패킹을 추가해 주세요.');
        return;
      }
      let targetBoxId = boxId || '';
      if (mode === 'create' && !targetBoxId) {
        alert('담을 박스를 선택할 수 없습니다.');
        return;
      }
      let currentQty = 0;
      let targetBox = state.boxes.find((entry) => entry.boxId === targetBoxId);
      if (mode === 'edit') {
        targetBoxId = boxId || '';
        targetBox = state.boxes.find((entry) => entry.boxId === targetBoxId);
        const content = targetBox?.contents.find((entry) => entry.itemId === itemId);
        if (!targetBox || !content) {
          alert('배정 정보를 찾을 수 없습니다.');
          return;
        }
        currentQty = Math.max(0, Math.floor(Number(content.qty) || 0));
      }
      if (!targetBox) {
        alert('존재하지 않는 박스입니다.');
        return;
      }
      const baseRemain = state.remainders.get(itemId) ?? item.totalQty;
      const available = mode === 'edit' ? baseRemain + currentQty : baseRemain;
      if (available <= 0) {
        alert('이 품목은 이미 모두 담았습니다.');
        return;
      }
      if (assignSubtitle instanceof HTMLElement) {
        const parts = [item.name || '', targetBox.name ? `→ ${targetBox.name}` : ''].filter(Boolean);
        assignSubtitle.textContent = parts.length ? parts.join(' ') : '품목 담기';
      }
      if (assignRemainLabel instanceof HTMLElement) {
        assignRemainLabel.textContent = quantityFormatter.format(available);
      }
      if (assignError instanceof HTMLElement) {
        assignError.textContent = '';
      }
      if (assignConfirm instanceof HTMLButtonElement) {
        assignConfirm.textContent = '확인';
      }
      if (assignQtyInput instanceof HTMLInputElement) {
        const defaultQty = mode === 'edit' ? currentQty : available;
        assignQtyInput.value = String(Math.max(1, Math.min(defaultQty || 1, available)));
        assignQtyInput.min = '1';
        assignQtyInput.max = String(available);
      }
      state.activeAssignment = {
        mode,
        itemId,
        boxId: targetBox.boxId,
        available,
      };
      assignDialog.showModal();
      if (assignQtyInput instanceof HTMLInputElement) {
        window.requestAnimationFrame(() => assignQtyInput.select());
      }
    };

    const handleAssignSubmit = (event) => {
      event.preventDefault();
      if (!state.activeAssignment) {
        closeAssignDialog();
        return;
      }
      if (!(assignQtyInput instanceof HTMLInputElement)) {
        closeAssignDialog();
        return;
      }
      const mode = state.activeAssignment.mode;
      const targetBoxId = state.activeAssignment.boxId;
      if (!targetBoxId) {
        if (assignError instanceof HTMLElement) {
          assignError.textContent = '담을 박스를 찾을 수 없습니다.';
        }
        return;
      }
      const rawQty = Number(assignQtyInput.value);
      const qty = Math.floor(rawQty);
      if (!Number.isFinite(qty) || qty < 1 || qty > state.activeAssignment.available) {
        if (assignError instanceof HTMLElement) {
          assignError.textContent = `수량이 올바르지 않습니다. 1 이상, 잔량 ${quantityFormatter.format(
            state.activeAssignment.available
          )}개 이하로 입력하세요.`;
        }
        return;
      }
      const box = state.boxes.find((entry) => entry.boxId === targetBoxId);
      if (!box) {
        if (assignError instanceof HTMLElement) {
          assignError.textContent = '존재하지 않는 박스입니다.';
        }
        return;
      }
      if (mode === 'edit') {
        const content = box.contents.find((entry) => entry.itemId === state.activeAssignment.itemId);
        if (!content) {
          if (assignError instanceof HTMLElement) {
            assignError.textContent = '배정 정보를 찾을 수 없습니다.';
          }
          return;
        }
        content.qty = qty;
      } else {
        const remainder = state.remainders.get(state.activeAssignment.itemId) ?? 0;
        if (qty > remainder) {
          if (assignError instanceof HTMLElement) {
            assignError.textContent = `수량이 올바르지 않습니다. 1 이상, 잔량 ${quantityFormatter.format(
              remainder
            )} 이하로 입력하세요.`;
          }
          return;
        }
        const existing = box.contents.find((entry) => entry.itemId === state.activeAssignment.itemId);
        if (existing) {
          existing.qty += qty;
        } else {
          box.contents.push({ itemId: state.activeAssignment.itemId, qty });
        }
      }
      closeAssignDialog();
      rerender();
    };

    const handleAssignCancel = () => {
      closeAssignDialog();
    };

    const handleDragStart = (event) => {
      const row = event.target instanceof HTMLElement ? event.target.closest('[data-packing-item-row]') : null;
      if (!(row instanceof HTMLElement)) return;
      const itemId = row.dataset.itemId;
      const disabled = row.dataset.disabled === 'true';
      if (!itemId || disabled) {
        event.preventDefault();
        return;
      }
      draggingItemId = itemId;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', itemId);
      }
      packingStep.dataset.dragging = 'true';
    };

    const handleDragEnd = () => {
      draggingItemId = null;
      delete packingStep.dataset.dragging;
      clearDroppableState();
    };

    const handleDragOver = (event) => {
      if (!draggingItemId) return;
      const card = event.target instanceof HTMLElement ? event.target.closest('[data-box-id]') : null;
      if (!card) return;
      const remainder = state.remainders.get(draggingItemId) ?? 0;
      if (remainder <= 0) return;
      event.preventDefault();
      card.dataset.droppable = 'true';
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    };

    const handleDragLeave = (event) => {
      const card = event.target instanceof HTMLElement ? event.target.closest('[data-box-id]') : null;
      if (!card) return;
      card.removeAttribute('data-droppable');
    };

    const handleDrop = (event) => {
      const itemId = draggingItemId;
      if (!itemId) return;
      const card = event.target instanceof HTMLElement ? event.target.closest('[data-box-id]') : null;
      if (!card) return;
      event.preventDefault();
      const boxId = card.dataset.boxId;
      const remainder = state.remainders.get(itemId) ?? 0;
      handleDragEnd();
      if (remainder <= 0) {
        alert('이 품목은 이미 모두 배정되었습니다.');
        return;
      }
      openAssignDialog({ itemId, boxId, mode: 'create' });
    };

    const handleItemsChange = () => {
      rerender({ updateItems: true });
    };

    const observeItems = () => {
      if (!(itemRowsRoot instanceof HTMLElement)) return;
      if (state.itemsObserver instanceof MutationObserver) {
        state.itemsObserver.disconnect();
      }
      state.itemsObserver = new MutationObserver(() => rerender({ updateItems: true }));
      state.itemsObserver.observe(itemRowsRoot, { childList: true });
    };

    if (!state.bound) {
      if (itemRowsRoot instanceof HTMLElement) {
        itemRowsRoot.addEventListener('input', handleItemsChange);
        itemRowsRoot.addEventListener('change', handleItemsChange);
      }
      if (createButton instanceof HTMLButtonElement) {
        createButton.addEventListener('click', handleCreate);
      }
      if (openButton instanceof HTMLButtonElement) {
        openButton.addEventListener('click', (event) => {
          event.preventDefault();
          openForm();
        });
      }
      if (closeButton instanceof HTMLButtonElement) {
        closeButton.addEventListener('click', (event) => {
          event.preventDefault();
          closeForm({ focusTrigger: true });
        });
      }
      if (cancelButton instanceof HTMLButtonElement) {
        cancelButton.addEventListener('click', (event) => {
          event.preventDefault();
          closeForm({ resetFields: true, focusTrigger: true });
        });
      }
      ['length', 'width', 'height'].forEach((key) => {
        const input = inputs[key];
        if (input instanceof HTMLInputElement) {
          input.addEventListener('input', updateCbmField);
          input.addEventListener('change', updateCbmField);
        }
      });
      if (packingItemsBody instanceof HTMLElement) {
        packingItemsBody.addEventListener('dragstart', handleDragStart);
        packingItemsBody.addEventListener('dragend', handleDragEnd);
      }
      if (packingList instanceof HTMLElement) {
        packingList.addEventListener('click', (event) => {
          const deleteButton = event.target.closest('[data-packing-delete]');
          if (deleteButton instanceof HTMLButtonElement) {
            handleDeleteBox(deleteButton.dataset.boxId);
            return;
          }
          const editButton = event.target.closest('[data-box-content-edit]');
          if (editButton instanceof HTMLButtonElement) {
            openAssignDialog({
              itemId: editButton.dataset.itemId || '',
              boxId: editButton.dataset.boxId || '',
              mode: 'edit',
            });
            return;
          }
          const removeButton = event.target.closest('[data-box-content-remove]');
          if (removeButton instanceof HTMLButtonElement) {
            if (window.confirm('해당 품목 배정을 삭제하시겠습니까?')) {
              handleRemoveContent(removeButton.dataset.boxId || '', removeButton.dataset.itemId || '');
            }
          }
        });
        packingList.addEventListener('dragover', handleDragOver);
        packingList.addEventListener('dragleave', handleDragLeave);
        packingList.addEventListener('drop', handleDrop);
      }
      if (assignForm instanceof HTMLFormElement) {
        assignForm.addEventListener('submit', handleAssignSubmit);
      }
      if (assignCancel instanceof HTMLButtonElement) {
        assignCancel.addEventListener('click', handleAssignCancel);
      }
      if (assignDialog instanceof HTMLDialogElement) {
        assignDialog.addEventListener('close', () => {
          state.activeAssignment = null;
          if (assignError instanceof HTMLElement) {
            assignError.textContent = '';
          }
        });
      }
      if (assignQtyInput instanceof HTMLInputElement) {
        const clearError = () => {
          if (assignError instanceof HTMLElement) {
            assignError.textContent = '';
          }
        };
        assignQtyInput.addEventListener('input', clearError);
        assignQtyInput.addEventListener('change', clearError);
      }
      form.addEventListener('reset', () => {
        window.requestAnimationFrame(() => {
          state.boxes = [];
          state.items = [];
          state.remainders = new Map();
          state.activeAssignment = null;
          state.formOpen = false;
          syncFormVisibility();
          closeAssignDialog();
          rerender();
          ensureDefaultName();
          updateCbmField();
        });
      });
      state.bound = true;
    }

    observeItems();
    syncFormVisibility();
    ensureDefaultName();
    updateCbmField();
    rerender({ updateItems: true });

    state.setData = ({ items = [], boxes = [] } = {}) => {
      if (Array.isArray(items)) {
        state.items = items.map((item, index) => ({
          id: item?.id || item?.itemId || item?.key || `item-${index + 1}`,
          no: String(item?.no ?? index + 1),
          name: item?.name ?? "",
          kind: item?.kind ?? item?.category ?? "",
          totalQty: Math.max(0, Math.floor(Number(item?.totalQty ?? item?.quantity ?? 0) || 0)),
        }));
      }
      state.boxes = Array.isArray(boxes)
        ? boxes.map((box, index) => ({
            boxId: box?.boxId || box?.id || `box-${index + 1}`,
            name: box?.name || `Packing ${String(index + 1).padStart(2, '0')}`,
            dimensions: {
              L: Number(box?.dimensions?.L ?? box?.length ?? 0) || 0,
              W: Number(box?.dimensions?.W ?? box?.width ?? 0) || 0,
              H: Number(box?.dimensions?.H ?? box?.height ?? 0) || 0,
              CBM: Number(box?.dimensions?.CBM ?? box?.cbm ?? 0) || 0,
            },
            weightKg: Number(box?.weightKg ?? box?.weight ?? 0) || 0,
            contents: Array.isArray(box?.contents)
              ? box.contents
                  .map((content) => ({
                    itemId: content?.itemId || content?.id || content?.key || '',
                    qty: Math.max(0, Math.floor(Number(content?.qty ?? content?.quantity ?? 0) || 0)),
                  }))
                  .filter((content) => content.itemId)
              : [],
            note: box?.note ?? '',
          }))
        : [];
      rerender({ updateItems: true });
    };

    state.openForm = (options) => openForm(options || {});
    state.closeForm = (options) => closeForm(options || {});

    syncPackingVisibility = (isActive) => {
      applyVisibility(isActive);
    };

    applyVisibility(currentStep === packingStepIndex);
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
    if (typeof syncPackingVisibility === "function" && packingStepIndex !== -1) {
      syncPackingVisibility(currentStep === packingStepIndex);
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
    if (expertSearchContainer && stepEl.contains(expertSearchContainer)) {
      const requiresExpert = (strategicValueInput?.value || "") === "전략물자 수출";
      const selectedValue =
        expertSelectedValueInput instanceof HTMLInputElement
          ? (expertSelectedValueInput.value || "").trim()
          : "";
      if (requiresExpert && !selectedValue) {
        alert("전략물자 전문판정서를 선택해주세요.");
        if (expertKeywordInput instanceof HTMLInputElement) {
          expertKeywordInput.focus();
        }
        return false;
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
    if (stepEl.hasAttribute("data-packing-step")) {
      const packingState = form._packingState;
      const boxes = Array.isArray(packingState?.boxes) ? packingState.boxes : [];
      if (!boxes.length) {
        alert('먼저 패킹을 추가해 주세요.');
        if (packingState && typeof packingState.openForm === 'function') {
          packingState.openForm({ focusInput: false });
        }
        const target = stepEl.querySelector('[data-packing-open]') || stepEl.querySelector('[data-packing-create]');
        if (target instanceof HTMLElement && typeof target.focus === 'function') {
          target.focus();
        }
        return false;
      }
      if (typeof packingState?.canComplete === 'function') {
        if (!packingState.canComplete()) {
          alert('잔량이 남아 있습니다. 배정되지 않은 품목을 확인해 주세요.');
          const focusRow = stepEl.querySelector('[data-packing-items-body] tr');
          if (focusRow instanceof HTMLElement && typeof focusRow.focus === 'function') {
            focusRow.focus();
          }
          return false;
        }
      } else {
        const items = Array.isArray(packingState?.items) ? packingState.items : [];
        const remainders =
          typeof packingState?.getRemainders === 'function'
            ? packingState.getRemainders()
            : new Map(items.map((item) => [item.id ?? item.key, Number(item?.totalQty ?? item?.quantity ?? 0)]));
        const hasPositiveItems = items.some((item) => Number(item?.totalQty ?? item?.quantity ?? 0) > 0);
        if (!hasPositiveItems) {
          alert('팩킹할 품목의 수량을 입력해주세요.');
          return false;
        }
        const remainingItem = items.find((item) => {
          const total = Number(item?.totalQty ?? item?.quantity ?? 0);
          if (!Number.isFinite(total) || total <= 0) return false;
          const key = item.id ?? item.key;
          const remain = key != null ? remainders.get(key) : undefined;
          return (remain ?? total) > 0;
        });
        if (remainingItem) {
          alert('잔량이 남아 있습니다. 배정되지 않은 품목을 확인해 주세요.');
          const focusRow = stepEl.querySelector('[data-packing-items-body] tr');
          if (focusRow instanceof HTMLElement && typeof focusRow.focus === 'function') {
            focusRow.focus();
          }
          return false;
        }
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
    const packingState = form._packingState;
    const packingData = packingState
      ? {
          items: Array.isArray(packingState.items) ? packingState.items : [],
          boxes: Array.isArray(packingState.boxes) ? packingState.boxes : [],
        }
      : null;
    addDraftEntry(values, {
      stepIndex: currentStep,
      totalSteps,
      packingData,
    });
    dialog.close();
    renderRows(getCombinedRows(lastFetchedItems), { page: currentPage });
    renderPagination();
    updateContinueButtonVisibility();
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

  setupExpertSearch();
  setupStrategicGroup();
  setupCountrySelector();
  setupSimpleCountrySelects();
  setupNotifyCopy();
  setupTransportModeField();
  setupInlineCalendar();
  setupIncotermsField();
  setupItemTable();
  setupPackingStep();
  toggleExportTypeDetail();

  const applyInitialFieldValues = (fields = {}) => {
    if (!fields || typeof fields !== "object") return;

    const setFieldValue = (name, value, { triggerChange = false } = {}) => {
      const field = form.elements[name];
      if (!field) return;
      const emitChange = (el) => {
        if (!triggerChange) return;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      if (field instanceof RadioNodeList) {
        const nodes = Array.from(field);
        if (!nodes.length) return;
        const values = Array.isArray(value)
          ? value.map((val) => (val === undefined || val === null ? "" : String(val)))
          : [value === undefined || value === null ? "" : String(value)];
        nodes.forEach((node) => {
          if (!(node instanceof HTMLInputElement)) return;
          if (node.type === "radio") {
            node.checked = values.includes(node.value);
          } else if (node.type === "checkbox") {
            node.checked =
              values.includes(node.value) || (values.includes("true") && node.value === "on");
          } else {
            node.value = values[0] ?? "";
          }
          emitChange(node);
        });
        return;
      }
      if (field instanceof HTMLInputElement) {
        if (field.type === "checkbox") {
          field.checked = Boolean(value);
        } else {
          field.value = value === undefined || value === null ? "" : String(value);
        }
        emitChange(field);
        return;
      }
      if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.value = value === undefined || value === null ? "" : String(value);
        emitChange(field);
      }
    };

    const setSimpleSelectValue = (name, value) => {
      const select = form.querySelector(`select[name="${name}"]`);
      if (!(select instanceof HTMLSelectElement)) return;
      ensureSimpleCountryOptions(select);
      const normalized = value === undefined || value === null ? "" : String(value);
      select.value = normalized;
      updateSimpleSelectDial(select);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };

    if (fields.exportType !== undefined) {
      setFieldValue("exportType", fields.exportType, { triggerChange: true });
    }
    if (fields.exportTypeDetail !== undefined) {
      setFieldValue("exportTypeDetail", fields.exportTypeDetail);
    }
    if (fields.invoiceCode !== undefined) {
      setFieldValue("invoiceCode", fields.invoiceCode);
    }
    if (fields.invoiceCodeLabel !== undefined) {
      setFieldValue("invoiceCodeLabel", fields.invoiceCodeLabel);
    }
    if (fields.exportNote !== undefined) {
      setFieldValue("exportNote", fields.exportNote);
      if (invoiceNoteInput instanceof HTMLInputElement) {
        invoiceNoteInput.dataset.manual = fields.exportNote ? "true" : "";
      }
    }
    if (fields.projectName !== undefined) {
      setFieldValue("projectName", fields.projectName);
    }
    if (fields.projectCode !== undefined) {
      setFieldValue("projectCode", fields.projectCode);
    }
    if (fields.managerName !== undefined) {
      setFieldValue("managerName", fields.managerName);
    }
    if (fields.managerDepartment !== undefined) {
      setFieldValue("managerDepartment", fields.managerDepartment);
    }
    if (fields.managerPhone !== undefined) {
      setFieldValue("managerPhone", fields.managerPhone);
    }
    if (fields.managerEmail !== undefined) {
      setFieldValue("managerEmail", fields.managerEmail);
    }
    if (fields.importCompanyName !== undefined) {
      setFieldValue("importCompanyName", fields.importCompanyName);
    }
    if (fields.importAddress !== undefined) {
      setFieldValue("importAddress", fields.importAddress);
    }
    if (fields.importCountry !== undefined) {
      setSimpleSelectValue("importCountry", fields.importCountry);
    }
    if (fields.importCountryCode !== undefined) {
      setFieldValue("importCountryCode", fields.importCountryCode);
    }
    if (fields.importPhone !== undefined) {
      setFieldValue("importPhone", fields.importPhone);
    }
    if (fields.importContactName !== undefined) {
      setFieldValue("importContactName", fields.importContactName);
    }
    if (fields.importContactPhone !== undefined) {
      setFieldValue("importContactPhone", fields.importContactPhone);
    }
    if (fields.importEmail !== undefined) {
      setFieldValue("importEmail", fields.importEmail);
    }
    if (fields.importEtc !== undefined) {
      setFieldValue("importEtc", fields.importEtc);
    }
    if (fields.notifySameAsImporter !== undefined) {
      setFieldValue("notifySameAsImporter", fields.notifySameAsImporter, { triggerChange: true });
    }
    if (fields.notifyCompanyName !== undefined) {
      setFieldValue("notifyCompanyName", fields.notifyCompanyName);
    }
    if (fields.notifyAddress !== undefined) {
      setFieldValue("notifyAddress", fields.notifyAddress);
    }
    if (fields.notifyCountry !== undefined) {
      setSimpleSelectValue("notifyCountry", fields.notifyCountry);
    }
    if (fields.notifyCountryCode !== undefined) {
      setFieldValue("notifyCountryCode", fields.notifyCountryCode);
    }
    if (fields.notifyPhone !== undefined) {
      setFieldValue("notifyPhone", fields.notifyPhone);
    }
    if (fields.notifyContactName !== undefined) {
      setFieldValue("notifyContactName", fields.notifyContactName);
    }
    if (fields.notifyContactPhone !== undefined) {
      setFieldValue("notifyContactPhone", fields.notifyContactPhone);
    }
    if (fields.notifyEmail !== undefined) {
      setFieldValue("notifyEmail", fields.notifyEmail);
    }
    if (fields.notifyEtc !== undefined) {
      setFieldValue("notifyEtc", fields.notifyEtc);
    }
    if (fields.originCountry !== undefined) {
      setSimpleSelectValue("originCountry", fields.originCountry);
    }
    if (fields.destinationCountry !== undefined) {
      setSimpleSelectValue("destinationCountry", fields.destinationCountry);
    }
    if (fields.dispatchDate !== undefined) {
      setFieldValue("dispatchDate", fields.dispatchDate, { triggerChange: true });
    }
    if (fields.loadingDate !== undefined) {
      setFieldValue("loadingDate", fields.loadingDate, { triggerChange: true });
    }
    if (fields.transportMode !== undefined) {
      setFieldValue("transportMode", fields.transportMode, { triggerChange: true });
    }
    if (fields.transportOther !== undefined) {
      setFieldValue("transportOther", fields.transportOther);
    }
    if (fields.incoterms !== undefined) {
      setFieldValue("incoterms", fields.incoterms, { triggerChange: true });
    }
    if (fields.incotermsOther !== undefined) {
      setFieldValue("incotermsOther", fields.incotermsOther);
    }
    if (fields.paymentTerms !== undefined) {
      setFieldValue("paymentTerms", fields.paymentTerms);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "invoiceNumber")) {
      const numberValue =
        fields.invoiceNumber === undefined || fields.invoiceNumber === null
          ? ""
          : String(fields.invoiceNumber).trim();
      if (numberValue) {
        form.dataset.invoiceExistingNumber = numberValue;
      } else {
        delete form.dataset.invoiceExistingNumber;
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, "invoiceSequence")) {
      const sequenceValue = parsePositiveInteger(fields.invoiceSequence);
      if (sequenceValue) {
        form.dataset.invoiceSequence = String(sequenceValue);
      } else {
        delete form.dataset.invoiceSequence;
      }
    }
    if (fields.strategicFlag !== undefined) {
      const value = fields.strategicFlag === undefined || fields.strategicFlag === null
        ? ""
        : String(fields.strategicFlag);
      strategicOptions.forEach((option) => {
        option.checked = option.value === value;
      });
      if (strategicValueInput) {
        strategicValueInput.value = value;
      }
      syncStrategicDependencies({ silent: true });
    }
    if (fields.strategicExpertCertificate !== undefined) {
      const certificateValue = fields.strategicExpertCertificate;
      const expertState = expertSearchContainer?._expertState;
      if (certificateValue) {
        const targetCertificate = EXPERT_CERTIFICATES.find(
          (item) =>
            item.id === certificateValue ||
            item.name === certificateValue
        );
        if (targetCertificate) {
          if (expertState?.setEnabled) {
            expertState.setEnabled(true);
          }
          if (expertState?.selectCertificate) {
            expertState.selectCertificate(targetCertificate, { silent: true });
          }
        }
      } else if (expertState?.clearSelection) {
        expertState.clearSelection({ silent: true });
      }
    }
    updateInvoiceCodeState({ force: !fields.exportNote });
  };

  if (fieldValues) {
    applyInitialFieldValues(fieldValues);
  }

  if (Array.isArray(itemRowsData) && itemRowsData.length) {
    form._itemTableState?.setRows(itemRowsData);
  }

  if (packingData) {
    form._packingState?.setData(packingData);
  }

  if (fieldValues) {
    syncStrategicDependencies({ silent: true });
    toggleExportTypeDetail();
    if (transportModeSelect instanceof HTMLSelectElement) {
      transportModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (incotermsSelect instanceof HTMLSelectElement) {
      incotermsSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setupInlineCalendar();
    updateStepActionState();
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
    } catch (err) {
      alert(err.message || "등록 중 오류");
    }
  };

  showStep(currentStep);
  dialog.showModal();
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
