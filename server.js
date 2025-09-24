import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/** --- 미니 데이터 저장(메모리) --- */
let seq = 5;
const exportsData = [
  { id: 1, item: "반도체 웨이퍼", qty: 1000, unitPrice: 2.5, country: "KR", status: "완료", createdAt: Date.now()-86400000*5 },
  { id: 2, item: "제어보드",     qty: 120,  unitPrice: 49.9, country: "US", status: "진행", createdAt: Date.now()-86400000*2 },
  { id: 3, item: "센서 모듈",     qty: 500,  unitPrice: 8.2,  country: "JP", status: "대기", createdAt: Date.now()-86400000*1 },
  { id: 4, item: "공정용 소프트", qty: 20,   unitPrice: 999,  country: "DE", status: "진행", createdAt: Date.now()-3600*1000 },
];

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
  const { item, qty, unitPrice, country, status } = req.body || {};
  if (!item || !country || !status) return res.status(400).json({ ok:false, error:"필수 항목 누락" });
  const qn = Number(qty), up = Number(unitPrice);
  if (Number.isNaN(qn) || Number.isNaN(up)) return res.status(400).json({ ok:false, error:"수량/단가 숫자 필요" });

  const row = {
    id: seq++,
    item: String(item),
    qty: Math.max(0, Math.floor(qn)),
    unitPrice: Math.max(0, Number(up)),
    country: String(country).toUpperCase(),
    status: String(status),
    createdAt: Date.now(),
  };
  exportsData.push(row);
  res.status(201).json({ ok: true, item: row });
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

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});