import { fmt } from "./catalog";

// Generates and triggers download of a PC build PDF using jsPDF.
// Dynamically imported so jsPDF (a browser-only lib) never lands in SSR bundles.
export async function downloadBuildPDF(buildName, slots, total, budget) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const docPdf = new jsPDF();
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(16);
  docPdf.text("TECHCOMPARE BD", 14, 18);
  docPdf.setFontSize(11);
  docPdf.setFont("helvetica", "normal");
  docPdf.text("PC Build List", 14, 25);

  docPdf.setFontSize(10);
  docPdf.text(`Build Name: ${buildName || "Untitled Build"}`, 14, 34);
  if (budget) docPdf.text(`Budget: ${fmt(budget)}`, 14, 40);
  docPdf.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, 14, budget ? 46 : 40);

  const rows = slots
    .filter((s) => s.product)
    .map((s) => [s.label, s.product.name, fmt(s.lowestPrice ?? 0), s.lowestShop || "-"]);

  autoTable(docPdf, {
    startY: budget ? 52 : 46,
    head: [["Component", "Product", "Best Price", "Best Shop"]],
    body: rows,
    foot: [["", "", "TOTAL", fmt(total)]],
    theme: "grid",
    headStyles: { fillColor: [14, 124, 107] },
    footStyles: { fillColor: [231, 243, 240], textColor: [10, 92, 79], fontStyle: "bold" },
    styles: { fontSize: 9 },
  });

  docPdf.save(`${(buildName || "techcompare-build").replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
