function safeFileName(name) {
  return (name || "techcompare-build")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "techcompare-build";
}

function generatedDate() {
  return new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function amountNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(/[৳,\s]/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountText(value) {
  return amountNumber(value).toLocaleString("en-US");
}

// jsPDF's text engine can render some Unicode fonts inconsistently, especially
// inside AutoTable. The Bengali Taka sign (U+09F3) is therefore rendered by
// the browser using the same bundled font and inserted into the PDF as a tiny
// image. This keeps the PDF text/selectability intact for names and numbers
// while guaranteeing that ৳ looks correct in Chrome/Edge/Acrobat.
let takaImagePromise;

async function getTakaImage() {
  if (takaImagePromise) return takaImagePromise;

  takaImagePromise = (async () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Taka symbol renderer requires a browser environment");
    }

    const fontFamily = "TechCompareTaka";
    if (!document.fonts.check(`16px ${fontFamily}`)) {
      const face = new FontFace(
        fontFamily,
        'url("/fonts/NotoSansBengali-Regular.ttf") format("truetype")'
      );
      await face.load();
      document.fonts.add(face);
    }
    await document.fonts.load(`72px ${fontFamily}`);

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create Taka symbol renderer");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `72px ${fontFamily}`;
    ctx.fillText("\u09F3", canvas.width / 2, canvas.height / 2 + 2);

    return canvas.toDataURL("image/png");
  })();

  try {
    return await takaImagePromise;
  } catch (error) {
    takaImagePromise = undefined;
    throw error;
  }
}

function drawTaka(docPdf, imageData, x, y, size = 2.7) {
  docPdf.addImage(imageData, "PNG", x, y, size, size);
}

function drawCurrency(docPdf, imageData, value, rightX, baselineY, fontSize = 8.5) {
  const text = amountText(value);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(fontSize);
  docPdf.setTextColor(31, 43, 61);

  const textWidth = docPdf.getTextWidth(text);
  const symbolSize = fontSize <= 8 ? 2.45 : 2.8;
  const gap = 0.9;
  const textX = rightX - textWidth;
  const symbolX = textX - gap - symbolSize;

  drawTaka(docPdf, imageData, symbolX, baselineY - symbolSize + 0.45, symbolSize);
  docPdf.text(text, textX, baselineY);
}

// Generates a polished A4 PC-build PDF. `slots` can contain either the
// builder shape ({label, product, lowestPrice, lowestShop}) or the same data
// reconstructed from a saved build in Profile.
export async function downloadBuildPDF(buildName, slots, total, budget) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const takaImage = await getTakaImage();

  const docPdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const margin = 14;

  // Header band.
  docPdf.setFillColor(12, 29, 57);
  docPdf.rect(0, 0, pageWidth, 28, "F");
  docPdf.setFillColor(14, 124, 107);
  docPdf.roundedRect(margin, 7, 11, 11, 2, 2, "F");
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(7);
  docPdf.text("TC", margin + 2.7, 14.2);
  docPdf.setFontSize(14);
  docPdf.text("TechCompare BD", margin + 15, 13.5);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.text("PC Build Shopping List", margin + 15, 19.5);
  docPdf.setFontSize(7);
  docPdf.text("techcomparebd.com", pageWidth - margin, 14, { align: "right" });

  // Build metadata.
  let y = 39;
  docPdf.setTextColor(24, 39, 63);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(17);
  docPdf.text(buildName || "Untitled Build", margin, y);
  y += 7;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);
  docPdf.setTextColor(92, 105, 122);
  docPdf.text(`Generated: ${generatedDate()}`, margin, y);
  if (budget) {
    const budgetRight = pageWidth - margin;
    drawCurrency(docPdf, takaImage, budget, budgetRight, y, 9);
  }
  y += 8;

  const rows = (slots || [])
    .filter((s) => s?.product)
    .map((s) => {
      const lowPrice = s.lowestPrice ?? s.low?.price ?? 0;
      const shop =
        s.lowestShop ||
        s.lowestShopName ||
        s.shop ||
        s.product?.offers?.find((o) => o.price === lowPrice)?.shopName ||
        "-";
      return [s.label || s.cat || "Component", s.product.name || "-", shop, amountText(lowPrice)];
    });

  autoTable(docPdf, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: "auto",
    head: [["COMPONENT", "PRODUCT", "SHOP", "PRICE"]],
    body: rows,
    foot: [["", "", "TOTAL PRICE", amountText(total)]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontStyle: "normal",
      fontSize: 8.5,
      textColor: [31, 43, 61],
      cellPadding: { top: 3.1, right: 3, bottom: 3.1, left: 3 },
      lineColor: [215, 222, 230],
      lineWidth: 0.25,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [14, 124, 107],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 3.2,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [247, 249, 250],
    },
    footStyles: {
      fillColor: [232, 243, 240],
      textColor: [10, 92, 79],
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 92 },
      2: { cellWidth: 35 },
      3: { cellWidth: 23, halign: "right" },
    },
    didParseCell(data) {
      if (data.column.index === 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "foot" && data.column.index === 2) {
        data.cell.styles.halign = "right";
      }
    },
    didDrawCell(data) {
      if (data.column.index !== 3 || (data.section !== "body" && data.section !== "foot")) return;

      const value = data.cell.raw;
      const text = amountText(value);
      const fontSize = data.section === "foot" ? 9 : 8.5;
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(fontSize);
      const textWidth = docPdf.getTextWidth(text);
      const rightX = data.cell.x + data.cell.width - data.cell.padding("right");
      const symbolSize = data.section === "foot" ? 2.8 : 2.7;
      const gap = 0.9;
      const textX = rightX - textWidth;
      const symbolX = textX - gap - symbolSize;
      const baselineY = data.cell.y + data.cell.height / 2 + fontSize * 0.35;

      // AutoTable already painted the numeric text. Cover only the old text
      // area and redraw the number beside the correctly-rendered Taka glyph.
      docPdf.setFillColor(...(data.section === "foot" ? [232, 243, 240] : data.row.index % 2 ? [247, 249, 250] : [255, 255, 255]));
      docPdf.rect(data.cell.x + 0.3, data.cell.y + 0.3, data.cell.width - 0.6, data.cell.height - 0.6, "F");
      docPdf.setTextColor(...(data.section === "foot" ? [10, 92, 79] : [31, 43, 61]));
      docPdf.text(text, textX, baselineY);
      drawTaka(docPdf, takaImage, symbolX, baselineY - symbolSize + 0.45, symbolSize);
    },
    didDrawPage(data) {
      const h = docPdf.internal.pageSize.getHeight();
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(7);
      docPdf.setTextColor(125, 135, 148);
      docPdf.text("Generated by TechCompare BD", margin, h - 8);
      docPdf.text(`Page ${data.pageNumber}`, pageWidth - margin, h - 8, { align: "right" });
    },
  });

  docPdf.save(`${safeFileName(buildName)}.pdf`);
}
