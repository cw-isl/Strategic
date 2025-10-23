import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { createInvoicePdfBuffer } from "./lib/invoice-pdf.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

/** --- 미니 데이터 저장(메모리) --- */
let seq = 6;
const exportsData = [
  { id: 1, item: "반도체 웨이퍼", qty: 1000, unitPrice: 2.5, country: "KR", status: "완료", createdAt: Date.now()-86400000*5 },
  { id: 2, item: "제어보드",     qty: 120,  unitPrice: 49.9, country: "US", status: "진행", createdAt: Date.now()-86400000*2 },
  { id: 3, item: "센서 모듈",     qty: 500,  unitPrice: 8.2,  country: "JP", status: "대기", createdAt: Date.now()-86400000*1 },
  { id: 4, item: "공정용 소프트", qty: 20,   unitPrice: 999,  country: "DE", status: "진행", createdAt: Date.now()-3600*1000 },
  {
    id: 5,
    item: "위성 통신 단말기 세트",
    qty: 45,
    unitPrice: 7800,
    country: "AE",
    status: "임시저장",
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    exportType: "정상판매",
    exportTypeDetail: "",
    projectName: "사막 위성망 구축 프로젝트",
    projectCode: "PJT-2024-042",
    projectNameDisplay: "사막 위성망 구축 프로젝트",
    projectCodeDisplay: "PJT-2024-042",
    strategicFlag: "전략물자 수출",
    strategicCategory: "전략물자 수출 (위성통신)",
    strategicBasis: "전문판정서 cert-002 참조",
    strategicExpertCertificate: "cert-002",
    strategicExpertCertificateName: "위성통신 모듈 전문판정서",
    strategicExpertCertificateDescription: "위성 통신용 RF 모듈 판정",
    managerName: "김수현",
    managerDepartment: "해외영업팀",
    managerPhone: "010-2345-6789",
    managerEmail: "soohyun.kim@example.com",
    requester: {
      name: "김수현",
      department: "해외영업팀",
      phone: "010-2345-6789",
      email: "soohyun.kim@example.com",
    },
    department: "해외영업팀",
    manager: "김수현",
    contactPhone: "010-2345-6789",
    companyName: "위성시스템㈜",
    businessNumber: "123-45-67890",
    contactName: "김수현",
    client: "Desert Comms LLC",
    clientCountry: "AE",
    clientManager: "Omar Hassan",
    endUser: "Desert Comms LLC",
    endUserCountry: "AE",
    endUse: "사막 지역 이동형 위성 통신망 구축",
    importCompanyName: "Desert Comms LLC",
    importAddress: "Al Wasl Rd 52, Dubai, UAE",
    importCountry: "AE",
    importCountryCode: "+971",
    importPhone: "+971-4-555-1234",
    importContactName: "Omar Hassan",
    importContactPhone: "+971-50-123-4567",
    importEmail: "omar.hassan@desertcomms.ae",
    importEtc: "VAT ID: AE123456789",
    notifySameAsImporter: false,
    notifyCompanyName: "Skyline Logistics",
    notifyAddress: "Warehouse 18, Dubai Logistics City, Dubai",
    notifyCountry: "AE",
    notifyCountryCode: "+971",
    notifyPhone: "+971-4-600-4321",
    notifyContactName: "Layla Al-Farsi",
    notifyContactPhone: "+971-50-765-4321",
    notifyEmail: "layla@skyline-logistics.ae",
    notifyEtc: "24시간 비상 연락 가능",
    originCountry: "KR",
    destinationCountry: "AE",
    dispatchDate: "2024-05-20",
    departureDate: "2024-05-21",
    shipmentDate: "2024-05-20",
    loadingDate: "2024-05-22",
    shipmentType: "정상판매",
    shipmentTypeRaw: "정상판매",
    shipmentPurpose: "정상판매",
    shipment: {
      originCountry: "KR",
      destinationCountry: "AE",
      dispatchDate: "2024-05-20",
      loadingDate: "2024-05-22",
      transportMode: "항공",
      transportModeRaw: "항공",
      incoterms: "CIF",
      incotermsRaw: "CIF",
      paymentTerms: "선지급 30%, 선적 후 70%",
    },
    transportMode: "항공",
    transportModeRaw: "항공",
    transportOther: "",
    incoterms: "CIF",
    incotermsOther: "",
    paymentTerms: "선지급 30%, 선적 후 70%",
    items: [
      {
        no: "1",
        name: "위성 통신 단말기 세트",
        category: "주요 장비",
        quantity: "45",
        currency: "USD",
        unitPrice: "7800",
        total: "351000",
        origin: "KR",
      },
      {
        no: "2",
        name: "설치 공구 키트",
        category: "부속품",
        quantity: "45",
        currency: "USD",
        unitPrice: "450",
        total: "20250",
        origin: "KR",
      },
      {
        no: "3",
        name: "예비 배터리 팩",
        category: "소모품",
        quantity: "45",
        currency: "USD",
        unitPrice: "180",
        total: "8100",
        origin: "KR",
      },
    ],
    currency: "USD",
    totalAmount: 379350,
    plStatus: "작성중",
    invoiceStatus: "작성중",
    invoiceCode: "SEA",
    invoiceCodeLabel: "수출계약",
    invoiceNote: "수출계약",
    invoiceSequence: 1,
    invoiceNumber: "SEA20240520_01",
    permitStatus: "신청완료",
    permitType: "전략물자 수출허가",
    permitNumber: "STP-2024-0088",
    declarationStatus: "미신고",
    declarationNumber: "",
    usageStatus: "미사용",
    blStatus: "미발행",
    fileNote: "상업송장, 패킹리스트 초안 검토 완료",
    note: "VAT ID: AE123456789 / 현지 설치팀 사전 교육 필요",
    attachments: ["commercial_invoice_draft.pdf", "packing_list_draft.xlsx"],
    statusHistory: [
      {
        status: "임시저장",
        message: "팩킹리스트까지 입력 완료 후 임시저장",
        at: "2024-05-12T09:45:00+09:00",
      },
    ],
    packing: {
      items: [
        { id: "item-1", no: "1", name: "위성 통신 단말기 세트", kind: "주요 장비", totalQty: 45 },
        { id: "item-2", no: "2", name: "설치 공구 키트", kind: "부속품", totalQty: 45 },
        { id: "item-3", no: "3", name: "예비 배터리 팩", kind: "소모품", totalQty: 45 },
      ],
      boxes: [
        {
          boxId: "BOX-01",
          name: "Packing 01",
          dimensions: { L: 120, W: 80, H: 90, CBM: 0.864 },
          weightKg: 380,
          contents: [
            { itemId: "item-1", qty: 25 },
            { itemId: "item-2", qty: 25 },
          ],
          note: "충격 센서 부착",
        },
        {
          boxId: "BOX-02",
          name: "Packing 02",
          dimensions: { L: 110, W: 75, H: 85, CBM: 0.701 },
          weightKg: 330,
          contents: [
            { itemId: "item-1", qty: 20 },
            { itemId: "item-3", qty: 45 },
          ],
          note: "온도 데이터 로거 동봉",
        },
      ],
      assignmentsCompleted: true,
      summary: {
        totalBoxes: 2,
        totalWeightKg: 710,
        totalCbm: 1.565,
        lastCheckedBy: "김수현",
        lastCheckedAt: "2024-05-12T09:40:00+09:00",
      },
    },
    draft: {
      completedSteps: 13,
      savedAt: "2024-05-12T09:45:00+09:00",
      savedBy: "김수현",
      memo: "전략물자 심사 결과 대기 중",
    },
    isDraft: true,
    lastUpdatedAt: "2024-05-12T09:45:00+09:00",
    lastUpdatedBy: "김수현",
  },
];

const parsePositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const int = Math.floor(num);
  if (int <= 0) return null;
  return int;
};

const formatInvoiceDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const eightDigit = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (eightDigit) {
      return `${eightDigit[1]}${eightDigit[2]}${eightDigit[3]}`;
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
};

const extractSequenceFromInvoiceNumber = (invoiceNumber) => {
  if (typeof invoiceNumber !== "string") return null;
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^[A-Z]{2,}\d{8}_(\d{2,})$/i);
  if (!match) return null;
  return parsePositiveInteger(match[1]);
};

const resolveExistingInvoiceNumber = (row = {}) => {
  if (!row || typeof row !== "object") return "";
  const candidates = [
    row.invoiceNumber,
    row.invoiceNo,
    row.invoice_no,
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
};

const resolveInvoiceCode = (row = {}) => {
  if (!row || typeof row !== "object") return "";
  const candidates = [
    row.invoiceCode,
    row.invoice_code,
    row.invoiceTypeCode,
    row.invoice_type_code,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }
  const existingNumber = resolveExistingInvoiceNumber(row);
  if (existingNumber) {
    const match = existingNumber.match(/^([A-Z]{2,})/i);
    if (match) return match[1].toUpperCase();
  }
  return "";
};

const resolveInvoiceSequence = (row = {}) => {
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
};

const resolveInvoiceDateValue = (row = {}) => {
  if (!row || typeof row !== "object") return null;
  return (
    row.dispatchDate ||
    row.shipmentDate ||
    (row.shipment && (row.shipment.dispatchDate || row.shipment.shipmentDate)) ||
    row.createdAt ||
    null
  );
};

const formatInvoiceNumber = ({ code, date, sequence, existingNumber } = {}) => {
  const existing = typeof existingNumber === "string" ? existingNumber.trim() : "";
  if (existing && /^[A-Z]{2,}\d{8}_(\d{2,})$/i.test(existing)) {
    return existing.toUpperCase();
  }
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalizedCode) return "";
  const dateKey = formatInvoiceDateKey(date) || formatInvoiceDateKey(Date.now());
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
};

const ensureInvoiceMetadata = (row = {}, { allocateSequence = true } = {}) => {
  if (!row || typeof row !== "object") return { number: "", sequence: null };
  let code = resolveInvoiceCode(row);
  if (!code) {
    code = "INV";
  }
  const dateValue = resolveInvoiceDateValue(row) || Date.now();
  const existingNumber = resolveExistingInvoiceNumber(row);
  let sequence = resolveInvoiceSequence(row);

  const dataset = exportsData;
  const dateKey = formatInvoiceDateKey(dateValue) || formatInvoiceDateKey(Date.now());

  if ((!sequence || !Number.isFinite(sequence)) && allocateSequence && code && dateKey) {
    let maxSeq = 0;
    for (const item of dataset) {
      if (!item || typeof item !== "object" || item === row) continue;
      const itemCode = resolveInvoiceCode(item);
      if (!itemCode || itemCode.trim().toUpperCase() !== code.trim().toUpperCase()) continue;
      const itemDateKey = formatInvoiceDateKey(resolveInvoiceDateValue(item));
      if (itemDateKey !== dateKey) continue;
      const itemSeq = resolveInvoiceSequence(item);
      if (itemSeq && itemSeq > maxSeq) {
        maxSeq = itemSeq;
      }
    }
    sequence = maxSeq + 1;
  }

  const number = formatInvoiceNumber({ code, date: dateValue, sequence, existingNumber });
  const normalizedSequence = sequence || extractSequenceFromInvoiceNumber(number) || null;

  if (number) {
    row.invoiceNumber = number;
  }
  if (normalizedSequence) {
    row.invoiceSequence = normalizedSequence;
  }

  return { number, sequence: normalizedSequence, code, dateKey };
};

exportsData.forEach((row) => ensureInvoiceMetadata(row, { allocateSequence: false }));

/** --- 보안/성능 기본기 --- */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/** --- 바디 파서 --- */
app.use(express.json());

/** --- API --- */
// 목록/검색
app.get("/api/exports", (req, res) => {
  const q = (req.query.query || "").toString().trim().toLowerCase();
  const pageFromQuery = Number.parseInt(req.query.page, 10);
  const sizeFromQuery = Number.parseInt(req.query.pageSize, 10);

  const pageSize = Number.isNaN(sizeFromQuery)
    ? 20
    : Math.min(Math.max(sizeFromQuery, 1), 100);

  let page = Number.isNaN(pageFromQuery) ? 1 : Math.max(pageFromQuery, 1);

  let items = exportsData.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (q) {
    items = items.filter((row) => {
      return [row.item, row.country, row.status].some((v) =>
        String(v).toLowerCase().includes(q)
      );
    });
  }

  const totalCount = items.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  if (totalPages > 0 && page > totalPages) {
    page = totalPages;
  }

  const startIndex = totalPages === 0 ? 0 : (page - 1) * pageSize;
  const pagedItems = items.slice(startIndex, startIndex + pageSize);

  res.json({
    ok: true,
    totalCount,
    totalPages,
    page: totalPages === 0 ? 1 : page,
    pageSize,
    items: pagedItems,
  });
});

// 신규 등록
app.post("/api/exports", (req, res) => {
  const payloadRaw = req.body;
  if (!payloadRaw || typeof payloadRaw !== "object") {
    return res.status(400).json({ ok: false, error: "잘못된 요청" });
  }

  const payload = JSON.parse(JSON.stringify(payloadRaw));
  const { item, qty, unitPrice, country, status } = payload;

  if (!item || !country || !status) {
    return res.status(400).json({ ok: false, error: "필수 항목 누락" });
  }

  const qn = Number(qty);
  const up = Number(unitPrice);
  if (Number.isNaN(qn) || Number.isNaN(up)) {
    return res.status(400).json({ ok: false, error: "수량/단가 숫자 필요" });
  }

  const row = { ...payload };
  row.id = seq++;
  row.item = String(item);
  row.qty = Math.max(0, Math.floor(qn));
  row.unitPrice = Math.max(0, Number(up));
  row.country = String(country).toUpperCase();
  row.status = String(status);
  row.createdAt = Date.now();

  const assignString = (key, value) => {
    row[key] = value ? String(value) : "";
  };

  const resolvedShipmentDate = payload.dispatchDate || payload.shipmentDate || "";
  if (resolvedShipmentDate) {
    const dateStr = String(resolvedShipmentDate);
    row.dispatchDate = dateStr;
    row.shipmentDate = dateStr;
  }

  assignString("shipmentType", payload.shipmentType);
  assignString("shipmentTypeRaw", payload.shipmentTypeRaw);
  assignString("shipmentPurpose", payload.shipmentPurpose);
  assignString("projectName", payload.projectName);
  assignString("projectCode", payload.projectCode);
  assignString("contractNumber", payload.contractNumber);
  assignString("itemSpec", payload.itemSpec);
  assignString("unit", payload.unit);
  assignString("client", payload.client);
  assignString("clientCountry", payload.clientCountry);
  assignString("clientManager", payload.clientManager);
  assignString("endUser", payload.endUser);
  assignString("endUserCountry", payload.endUserCountry);
  assignString("endUse", payload.endUse);
  assignString("transportMode", payload.transportMode);
  assignString("departureDate", payload.departureDate);
  assignString("department", payload.department);
  assignString("manager", payload.manager);
  assignString("managerEmail", payload.managerEmail);
  assignString("strategicFlag", payload.strategicFlag);
  assignString("strategicCategory", payload.strategicCategory);
  assignString("strategicBasis", payload.strategicBasis);
  assignString("permitType", payload.permitType);
  assignString("permitNumber", payload.permitNumber);
  assignString("declarationNumber", payload.declarationNumber);
  assignString("plStatus", payload.plStatus);
  assignString("invoiceStatus", payload.invoiceStatus);
  assignString("invoiceCode", payload.invoiceCode);
  assignString("invoiceCodeLabel", payload.invoiceCodeLabel);
  assignString("invoiceNote", payload.invoiceNote);
  assignString("permitStatus", payload.permitStatus);
  assignString("declarationStatus", payload.declarationStatus);
  assignString("usageStatus", payload.usageStatus);
  assignString("blStatus", payload.blStatus);
  assignString("fileNote", payload.fileNote);
  assignString("note", payload.note);
  assignString("companyName", payload.companyName);
  assignString("businessNumber", payload.businessNumber);
  assignString("contactName", payload.contactName);
  assignString("contactPhone", payload.contactPhone);
  assignString("originCountry", payload.originCountry);
  assignString("destinationCountry", payload.destinationCountry);
  assignString("loadingDate", payload.loadingDate);
  assignString("transportOther", payload.transportOther);
  assignString("incoterms", payload.incoterms);
  assignString("incotermsOther", payload.incotermsOther);
  assignString("paymentTerms", payload.paymentTerms);
  assignString("managerName", payload.managerName);
  assignString("managerDepartment", payload.managerDepartment);
  assignString("managerPhone", payload.managerPhone);
  assignString("importCompanyName", payload.importCompanyName);
  assignString("importAddress", payload.importAddress);
  assignString("importCountry", payload.importCountry);
  assignString("importCountryCode", payload.importCountryCode);
  assignString("importPhone", payload.importPhone);
  assignString("importContactName", payload.importContactName);
  assignString("importContactPhone", payload.importContactPhone);
  assignString("importEmail", payload.importEmail);
  assignString("importEtc", payload.importEtc);
  row.notifySameAsImporter = Boolean(payload.notifySameAsImporter);
  assignString("notifyCompanyName", payload.notifyCompanyName);
  assignString("notifyAddress", payload.notifyAddress);
  assignString("notifyCountry", payload.notifyCountry);
  assignString("notifyCountryCode", payload.notifyCountryCode);
  assignString("notifyPhone", payload.notifyPhone);
  assignString("notifyContactName", payload.notifyContactName);
  assignString("notifyContactPhone", payload.notifyContactPhone);
  assignString("notifyEmail", payload.notifyEmail);
  assignString("notifyEtc", payload.notifyEtc);

  if (!row.requester || typeof row.requester !== "object") {
    row.requester = {
      name: row.managerName,
      department: row.managerDepartment,
      phone: row.managerPhone,
      email: row.managerEmail,
    };
  }

  if (!row.importer || typeof row.importer !== "object") {
    row.importer = {
      companyName: row.importCompanyName,
      address: row.importAddress,
      country: row.importCountry,
      countryCode: row.importCountryCode,
      phone: row.importPhone,
      contactName: row.importContactName,
      contactPhone: row.importContactPhone,
      email: row.importEmail,
      etc: row.importEtc,
    };
  }

  if (!row.notifyParty || typeof row.notifyParty !== "object") {
    row.notifyParty = {
      sameAsImporter: row.notifySameAsImporter,
      companyName: row.notifyCompanyName,
      address: row.notifyAddress,
      country: row.notifyCountry,
      countryCode: row.notifyCountryCode,
      phone: row.notifyPhone,
      contactName: row.notifyContactName,
      contactPhone: row.notifyContactPhone,
      email: row.notifyEmail,
      etc: row.notifyEtc,
    };
  }

  if (!row.shipment || typeof row.shipment !== "object") {
    row.shipment = {
      originCountry: row.originCountry,
      destinationCountry: row.destinationCountry,
      dispatchDate: row.dispatchDate,
      loadingDate: row.loadingDate,
      transportMode: row.transportMode,
      transportModeRaw: payload.transportMode,
      incoterms: row.incoterms,
      incotermsRaw: payload.incoterms,
      paymentTerms: row.paymentTerms,
    };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  row.items = items;

  const parseAmount = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const numeric = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const computedTotal = items.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const total = parseAmount(item.total);
    if (total) return sum + total;
    const qtyValue = parseAmount(item.quantity);
    const unitValue = parseAmount(item.unitPrice);
    if (qtyValue && unitValue) {
      return sum + qtyValue * unitValue;
    }
    return sum;
  }, 0);

  const existingTotal = parseAmount(row.totalAmount);
  if (computedTotal > 0 && existingTotal <= 0) {
    row.totalAmount = Number(computedTotal.toFixed(2));
  } else if (existingTotal > 0) {
    row.totalAmount = Number(existingTotal.toFixed(2));
  }

  if (!row.currency) {
    const firstCurrencyItem = items.find((item) => item && item.currency);
    const firstCurrency = firstCurrencyItem ? firstCurrencyItem.currency : undefined;
    if (firstCurrency) {
      row.currency = String(firstCurrency);
    }
  }

  const invoiceMeta = ensureInvoiceMetadata(row);
  if (invoiceMeta.number) {
    row.invoiceGeneratedAt = Date.now();
    if (!row.invoiceStatus) {
      row.invoiceStatus = "자동생성";
    }
  }

  exportsData.push(row);
  res.status(201).json({ ok: true, item: row });
});

app.get("/api/exports/:id/invoice.pdf", (req, res) => {
  const { id } = req.params;
  const idStr = String(id !== undefined && id !== null ? id : "").trim();
  if (!idStr) {
    return res.status(404).json({ ok: false, error: "대상을 찾을 수 없습니다." });
  }

  const target = exportsData.find((row) => {
    if (!row || typeof row !== "object") return false;
    const candidates = [
      row.id,
      row._id,
      row._entryId,
      row.projectCode,
      row.contractNumber,
      row.invoiceNumber,
    ];
    return candidates.some((candidate) => {
      if (candidate === undefined || candidate === null) return false;
      return String(candidate).trim() === idStr;
    });
  });

  if (!target) {
    return res.status(404).json({ ok: false, error: "대상을 찾을 수 없습니다." });
  }

  const invoiceMeta = ensureInvoiceMetadata(target);
  if (!invoiceMeta.number) {
    return res.status(404).json({ ok: false, error: "Invoice 정보가 없습니다." });
  }

  target.invoiceGeneratedAt = target.invoiceGeneratedAt || Date.now();
  if (!target.invoiceStatus) {
    target.invoiceStatus = "자동생성";
  }

  const pdfBuffer = createInvoicePdfBuffer(target, {
    invoiceNumber: invoiceMeta.number,
  });

  const safeName = (invoiceMeta.number || `invoice-${idStr}`).replace(/[^A-Za-z0-9_-]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
  res.send(pdfBuffer);
});

/** --- 캐시 비활성화 유틸 --- */
const setNoCacheHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

/** --- 정적 파일 --- */
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      setNoCacheHeaders(res);
    },
  })
);

/** --- SPA 라우팅 --- */
app.get("*", (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  const displayedHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`✅ Server running on http://${displayedHost}:${PORT}`);
});