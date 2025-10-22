const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TABLE_FONT_SIZE = 9;
const TABLE_LINE_HEIGHT = TABLE_FONT_SIZE * 1.35;
const TABLE_CELL_PADDING = 4;

const approxTextWidth = (text, size) => {
  if (!text) return 0;
  return String(text).length * (size * 0.5);
};

const escapePdfString = (value) => {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
};

const toPdfY = (offsetFromTop) => PAGE_HEIGHT - MARGIN - offsetFromTop;

const addText = (commands, xFromLeft, yFromTop, text, options = {}) => {
  if (text === undefined || text === null || text === "") return;
  const { size = 10, font = "F1", align = "left", width } = options;
  const safeText = escapePdfString(text);
  let x = MARGIN + xFromLeft;
  if (width) {
    if (align === "center") {
      const textWidth = approxTextWidth(text, size);
      const delta = Math.max(0, (width - textWidth) / 2);
      x += delta;
    } else if (align === "right") {
      const textWidth = approxTextWidth(text, size);
      const delta = Math.max(0, width - textWidth);
      x += delta;
    }
  }
  const y = toPdfY(yFromTop);
  commands.push(
    `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${safeText}) Tj ET`
  );
};

const drawLine = (commands, x1, y1, x2, y2, lineWidth = 0.7) => {
  const startX = MARGIN + x1;
  const startY = toPdfY(y1);
  const endX = MARGIN + x2;
  const endY = toPdfY(y2);
  commands.push(
    `q ${lineWidth} w ${startX.toFixed(2)} ${startY.toFixed(2)} m ${endX.toFixed(2)} ${endY.toFixed(2)} l S Q`
  );
};

const drawRect = (commands, x, yFromTop, width, height, lineWidth = 0.7) => {
  const leftX = MARGIN + x;
  const bottomY = toPdfY(yFromTop + height);
  const topY = toPdfY(yFromTop);
  const rightX = leftX + width;
  commands.push(
    [
      "q",
      `${lineWidth} w`,
      `${leftX.toFixed(2)} ${bottomY.toFixed(2)} m`,
      `${rightX.toFixed(2)} ${bottomY.toFixed(2)} l`,
      `${rightX.toFixed(2)} ${topY.toFixed(2)} l`,
      `${leftX.toFixed(2)} ${topY.toFixed(2)} l`,
      "h S Q",
    ].join(" ")
  );
};

const wrapText = (text, width, fontSize) => {
  const sanitized = String(text ?? "");
  if (!sanitized) return [""];
  const charWidth = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  if (charWidth <= 1) {
    return sanitized.split(/\s+/).filter(Boolean);
  }
  const lines = [];
  const segments = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const segment of segments) {
    const words = segment.split(/\s+/).filter((word) => word !== "");
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= charWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
      }
      if (word.length > charWidth) {
        let start = 0;
        while (start < word.length) {
          const slice = word.slice(start, start + charWidth);
          if (slice.length === charWidth) {
            lines.push(slice);
          } else {
            current = slice;
          }
          start += charWidth;
        }
        if (start % charWidth === 0) {
          current = "";
        }
      } else {
        current = word;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.length ? lines : [""];
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return numberFormatter.format(num);
};

const parseAmount = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const computeItemRows = (row, currency) => {
  const baseItems = Array.isArray(row.items) ? row.items : [];
  const items = baseItems.length
    ? baseItems
    : [
        {
          no: "1",
          name: row.item,
          category: row.itemSpec || row.shipmentType || "",
          quantity: row.qty,
          unitPrice: row.unitPrice,
          total: row.totalAmount,
          origin: row.originCountry || row.shipment?.originCountry,
          unit: row.unit || "EA",
          currency: row.currency || currency,
        },
      ];

  return items
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const quantity = parseAmount(item.quantity);
      const unitPrice = parseAmount(item.unitPrice);
      const total = parseAmount(item.total) || (quantity && unitPrice ? quantity * unitPrice : 0);
      return {
        no: item.no || String(index + 1),
        description: item.name || row.item || "",
        hs: item.category || "",
        unit: item.unit || row.unit || (quantity ? "EA" : ""),
        unitPrice: unitPrice,
        amount: total,
        origin: item.origin || row.originCountry || row.shipment?.originCountry || "",
        quantity,
      };
    });
};

const buildTableStructure = (items, currency) => {
  const columns = [
    { key: "no", label: "No.", width: 35, align: "center" },
    { key: "description", label: "Description of goods", width: 190, align: "left" },
    { key: "hs", label: "Category", width: 60, align: "left" },
    { key: "unit", label: "Unit", width: 45, align: "center" },
    { key: "unitPrice", label: `Unit Price (${currency})`, width: 80, align: "right" },
    { key: "amount", label: `Amount (${currency})`, width: 95, align: "right" },
  ];
  let used = columns.reduce((sum, col) => sum + col.width, 0);
  let originWidth = CONTENT_WIDTH - used;
  if (originWidth < 50) {
    const adjust = 50 - originWidth;
    const desc = columns.find((col) => col.key === "description");
    if (desc) {
      desc.width = Math.max(120, desc.width - adjust);
    }
    used = columns.reduce((sum, col) => sum + col.width, 0);
    originWidth = Math.max(40, CONTENT_WIDTH - used);
  }
  columns.push({ key: "origin", label: "Country of origin", width: originWidth, align: "center" });
  return columns;
};

const prepareTableRows = (items, columns) => {
  return items.map((item) => {
    const lines = {};
    let height = TABLE_FONT_SIZE + TABLE_CELL_PADDING * 2;
    for (const column of columns) {
      const rawValue = column.key === "unitPrice" || column.key === "amount"
        ? formatNumber(item[column.key])
        : item[column.key] ?? "";
      const width = Math.max(10, column.width - TABLE_CELL_PADDING * 2);
      const wrapped = wrapText(rawValue, width, TABLE_FONT_SIZE);
      lines[column.key] = wrapped;
      const columnHeight = wrapped.length * TABLE_LINE_HEIGHT + TABLE_CELL_PADDING * 2;
      if (columnHeight > height) {
        height = columnHeight;
      }
    }
    return { data: item, lines, height };
  });
};

const formatSummaryCurrency = (value, currency) => {
  const numberText = formatNumber(value);
  if (!numberText || numberText === "-") return "-";
  return currency ? `${currency} ${numberText}` : numberText;
};

export const createInvoicePdfBuffer = (row, options = {}) => {
  const invoiceNumber = options.invoiceNumber || row.invoiceNumber || "";
  const invoiceDate = formatDate(row.dispatchDate || row.shipmentDate || row.createdAt || Date.now());
  const shipperName = row.companyName || "Shipper";
  const shipperLines = [
    shipperName,
    row.businessNumber ? `Business No. ${row.businessNumber}` : "",
    row.managerDepartment ? `Dept. ${row.managerDepartment}` : "",
    row.managerName || row.contactName ? `Contact: ${row.managerName || row.contactName}` : "",
    row.managerPhone || row.contactPhone ? `Tel: ${row.managerPhone || row.contactPhone}` : "",
    row.managerEmail ? `Email: ${row.managerEmail}` : "",
  ].filter((line) => line);

  const consigneeLines = [
    row.importCompanyName || row.importer?.companyName || "Consignee",
    row.importAddress || row.importer?.address || "",
    row.importCountry ? `Country: ${row.importCountry}` : "",
    row.importPhone || row.importer?.phone ? `Tel: ${row.importPhone || row.importer?.phone}` : "",
    row.importContactName || row.importer?.contactName
      ? `Attn. ${row.importContactName || row.importer?.contactName}`
      : "",
    row.importEmail || row.importer?.email ? `Email: ${row.importEmail || row.importer?.email}` : "",
  ].filter((line) => line);

  const notifyLines = [
    row.notifyCompanyName || row.notifyParty?.companyName || "Notify party",
    row.notifyAddress || row.notifyParty?.address || "",
    row.notifyCountry || row.notifyParty?.country ? `Country: ${row.notifyCountry || row.notifyParty?.country}` : "",
    row.notifyPhone || row.notifyParty?.phone ? `Tel: ${row.notifyPhone || row.notifyParty?.phone}` : "",
    row.notifyContactName || row.notifyParty?.contactName
      ? `Attn. ${row.notifyContactName || row.notifyParty?.contactName}`
      : "",
    row.notifyEmail || row.notifyParty?.email ? `Email: ${row.notifyEmail || row.notifyParty?.email}` : "",
  ].filter((line) => line);

  const currency = (row.currency || row.items?.find((item) => item?.currency)?.currency || "USD").toString().toUpperCase();
  const items = computeItemRows(row, currency);
  const columns = buildTableStructure(items, currency);
  const tableRows = prepareTableRows(items, columns);

  const commands = [];
  addText(commands, 0, 0, "SECUI", { size: 18, font: "F2" });
  addText(commands, 0, 24, "Commercial Invoice", {
    size: 16,
    font: "F2",
    align: "center",
    width: CONTENT_WIDTH,
  });

  const infoTop = 50;
  const leftWidth = Math.round(CONTENT_WIDTH * 0.62);
  const rightWidth = CONTENT_WIDTH - leftWidth;
  const infoHeight = 186;
  const leftSectionHeight = infoHeight / 3;

  drawRect(commands, 0, infoTop, leftWidth, infoHeight);
  drawRect(commands, leftWidth, infoTop, rightWidth, infoHeight);
  drawLine(commands, 0, infoTop + leftSectionHeight, leftWidth, infoTop + leftSectionHeight);
  drawLine(commands, 0, infoTop + leftSectionHeight * 2, leftWidth, infoTop + leftSectionHeight * 2);

  const renderSection = (title, lines, sectionIndex) => {
    const sectionTop = infoTop + sectionIndex * leftSectionHeight;
    addText(commands, 8, sectionTop + 16, title, { font: "F2", size: 10 });
    lines.forEach((line, idx) => {
      addText(commands, 8, sectionTop + 30 + idx * 12, line, { size: 9 });
    });
  };

  renderSection("Shipper & Exporter", shipperLines, 0);
  renderSection("Consignee", consigneeLines, 1);
  renderSection("Notify party", notifyLines, 2);

  const metaEntries = [
    { label: "No. & Date of invoice", value: invoiceNumber ? `${invoiceNumber} / ${invoiceDate}` : invoiceDate },
    {
      label: "No. & Date of order",
      value: row.contractNumber
        ? `${row.contractNumber}${row.departureDate ? ` / ${formatDate(row.departureDate)}` : ""}`
        : row.projectCode || "",
    },
    {
      label: "Terms of delivery",
      value: row.incoterms || row.shipment?.incoterms || row.transportMode || "",
    },
    {
      label: "Terms of payment",
      value: row.paymentTerms || row.shipment?.paymentTerms || "",
    },
    {
      label: "Country of origin",
      value: row.originCountry || row.shipment?.originCountry || "",
    },
    {
      label: "Country of destination",
      value: row.destinationCountry || row.shipment?.destinationCountry || row.country || "",
    },
    {
      label: "Remarks",
      value: row.invoiceNote || row.note || row.fileNote || "",
    },
  ];

  const metaLabelWidth = 88;
  const metaValueWidth = rightWidth - metaLabelWidth - 16;
  let metaCursor = infoTop + 16;
  for (const entry of metaEntries) {
    addText(commands, leftWidth + 8, metaCursor, entry.label, { font: "F2", size: 9 });
    const lines = wrapText(entry.value || "-", metaValueWidth, 9);
    lines.forEach((line, idx) => {
      addText(commands, leftWidth + 8 + metaLabelWidth, metaCursor + idx * 11.5, line, { size: 9 });
    });
    metaCursor += Math.max(18, lines.length * 11.5 + 6);
    if (metaCursor > infoTop + infoHeight - 20) break;
  }

  const portTop = infoTop + infoHeight + 14;
  const portHeight = 48;
  drawRect(commands, 0, portTop, CONTENT_WIDTH, portHeight);
  drawLine(commands, CONTENT_WIDTH / 2, portTop, CONTENT_WIDTH / 2, portTop + portHeight);
  addText(commands, 8, portTop + 16, "Port of loading", { font: "F2", size: 10 });
  addText(commands, CONTENT_WIDTH / 2 + 8, portTop + 16, "Final destination", { font: "F2", size: 10 });

  const portOfLoading = [
    row.shipment?.originCountry || row.originCountry || "",
    formatDate(row.shipment?.dispatchDate || row.dispatchDate),
  ]
    .filter((value) => value)
    .join(" · ");
  const finalDestination = [
    row.shipment?.destinationCountry || row.destinationCountry || row.country || "",
    formatDate(row.shipment?.loadingDate || row.loadingDate || row.departureDate),
  ]
    .filter((value) => value)
    .join(" · ");

  addText(commands, 8, portTop + 32, portOfLoading || "-", { size: 9 });
  addText(commands, CONTENT_WIDTH / 2 + 8, portTop + 32, finalDestination || "-", { size: 9 });

  const tableTop = portTop + portHeight + 16;
  const headerHeight = 24;
  drawRect(commands, 0, tableTop, CONTENT_WIDTH, headerHeight);
  let colX = 0;
  columns.forEach((column, idx) => {
    if (idx > 0) {
      drawLine(commands, colX, tableTop, colX, tableTop + headerHeight);
    }
    addText(commands, colX + 4, tableTop + 16, column.label, {
      font: "F2",
      size: 9,
      width: column.width - 8,
      align: column.align,
    });
    colX += column.width;
  });

  let tableCursor = tableTop + headerHeight;
  for (const rowData of tableRows) {
    drawRect(commands, 0, tableCursor, CONTENT_WIDTH, rowData.height);
    let cellX = 0;
    columns.forEach((column, idx) => {
      if (idx > 0) {
        drawLine(commands, cellX, tableCursor, cellX, tableCursor + rowData.height);
      }
      const cellLines = rowData.lines[column.key] || [""];
      cellLines.forEach((line, lineIdx) => {
        addText(
          commands,
          cellX + TABLE_CELL_PADDING,
          tableCursor + TABLE_CELL_PADDING + TABLE_FONT_SIZE + lineIdx * TABLE_LINE_HEIGHT,
          line,
          {
            size: TABLE_FONT_SIZE,
            width: column.width - TABLE_CELL_PADDING * 2,
            align: column.align === "right" ? "right" : column.align,
          }
        );
      });
      cellX += column.width;
    });
    tableCursor += rowData.height;
  }

  const totalAmount = parseAmount(row.totalAmount) || tableRows.reduce((sum, item) => sum + (item.data.amount || 0), 0);
  const summaryTop = tableCursor + 20;
  const summaryWidth = 220;
  const summaryX = CONTENT_WIDTH - summaryWidth;
  addText(commands, summaryX, summaryTop, `Total amount (${currency})`, {
    font: "F2",
    size: 11,
    width: summaryWidth,
    align: "right",
  });
  addText(commands, summaryX, summaryTop + 18, formatSummaryCurrency(totalAmount, currency), {
    font: "F2",
    size: 14,
    width: summaryWidth,
    align: "right",
  });

  const nonCommercial = row.invoiceNote && row.invoiceNote.toLowerCase().includes("non commercial")
    ? row.invoiceNote
    : "Non Commercial Value. With best description.";
  addText(commands, 0, summaryTop, nonCommercial, { size: 9 });

  const signTop = summaryTop + 70;
  addText(commands, 0, signTop, "Signed by", { font: "F2", size: 10 });
  drawLine(commands, 65, signTop + 6, 240, signTop + 6);
  addText(commands, 70, signTop + 4, row.managerName || row.contactName || shipperName, { size: 10 });

  const contentStream = commands.join("\n");
  const streamLength = Buffer.byteLength(contentStream, "utf8");

  const objects = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      id: 3,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    },
    { id: 4, body: `<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream` },
    { id: 5, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { id: 6, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" },
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }
  const xrefPosition = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};
