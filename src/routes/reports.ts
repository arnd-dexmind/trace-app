import { Router } from "express";
import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";

export const reportsRouter = Router();

reportsRouter.use(createAuthMiddleware());

type ReportFormat = "pdf" | "csv";

function getFormat(req: Request): ReportFormat {
  const f = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "";
  return f === "csv" ? "csv" : "pdf";
}

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

// ── Inventory Report ─────────────────────────────────────────────────────

reportsRouter.get("/inventory", async (req: Request, res: Response) => {
  const tenantId = res.locals.tenantId;
  const spaceId = typeof req.query.spaceId === "string" ? req.query.spaceId : null;
  const format = getFormat(req);

  if (!spaceId) {
    sendApiError(res, 400, "BAD_REQUEST", "spaceId query parameter is required");
    return;
  }

  const items = await db.inventoryItem.findMany({
    where: { spaceId, tenantId },
    orderBy: { name: "asc" },
    include: {
      locationHistory: {
        orderBy: { observedAt: "desc" },
        take: 1,
        include: {
          zone: { select: { name: true } },
          storageLocation: { select: { name: true } },
        },
      },
      repairIssues: {
        select: { id: true, title: true, status: true },
      },
    },
  });

  if (format === "csv") {
    const header = ["Name", "Category", "Description", "Quantity", "Zone", "Location", "Last Seen", "Created", "Active Repairs"].join(",");
    const rows = items.map((item) => {
      const latest = item.locationHistory[0];
      return [
        csvEscape(item.name),
        csvEscape(item.category),
        csvEscape(item.description),
        item.quantity,
        csvEscape(latest?.zone?.name || ""),
        csvEscape(latest?.storageLocation?.name || ""),
        formatDate(latest?.observedAt),
        formatDate(item.createdAt),
        item.repairIssues.filter((r) => r.status !== "resolved" && r.status !== "verified").length,
      ].join(",");
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
    res.send([header, ...rows].join("\n"));
    return;
  }

  // PDF
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
    info: { Title: "Inventory Report", Author: "PerifEye" },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=inventory.pdf");
  doc.pipe(res);

  doc.fontSize(18).text("Inventory Report", { align: "left" });
  doc.fontSize(10).text(`${items.length} items — ${new Date().toLocaleDateString()}`, { align: "left" });
  doc.moveDown(0.5);

  // Table
  const columns = [
    { key: "name", label: "Name", width: 130 },
    { key: "category", label: "Category", width: 80 },
    { key: "description", label: "Description", width: 130 },
    { key: "quantity", label: "Qty", width: 35 },
    { key: "zone", label: "Zone", width: 80 },
    { key: "location", label: "Location", width: 80 },
    { key: "lastSeen", label: "Last Seen", width: 70 },
    { key: "created", label: "Created", width: 70 },
    { key: "activeRepairs", label: "Repairs", width: 50 },
  ];

  const tableTop = doc.y + 8;
  drawTable(doc, columns, tableTop, items.map((item) => {
    const latest = item.locationHistory[0];
    return {
      name: item.name,
      category: item.category || "",
      description: (item.description || "").slice(0, 60),
      quantity: String(item.quantity),
      zone: latest?.zone?.name || "",
      location: latest?.storageLocation?.name || "",
      lastSeen: formatDate(latest?.observedAt),
      created: formatDate(item.createdAt),
      activeRepairs: String(item.repairIssues.filter((r) => r.status !== "resolved" && r.status !== "verified").length),
    };
  }));

  doc.end();
});

// ── Repairs Report ────────────────────────────────────────────────────────

reportsRouter.get("/repairs", async (req: Request, res: Response) => {
  const tenantId = res.locals.tenantId;
  const spaceId = typeof req.query.spaceId === "string" ? req.query.spaceId : null;
  const format = getFormat(req);

  if (!spaceId) {
    sendApiError(res, 400, "BAD_REQUEST", "spaceId query parameter is required");
    return;
  }

  const repairs = await db.repairIssue.findMany({
    where: { spaceId, tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      item: { select: { name: true } },
    },
  });

  if (format === "csv") {
    const header = ["Title", "Description", "Severity", "Status", "Item", "Created", "Updated", "Resolved"].join(",");
    const rows = repairs.map((r) => {
      return [
        csvEscape(r.title),
        csvEscape(r.description),
        csvEscape(r.severity),
        csvEscape(r.status),
        csvEscape(r.item?.name || ""),
        formatDate(r.createdAt),
        formatDate(r.updatedAt),
        formatDate(r.resolvedAt),
      ].join(",");
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=repairs.csv");
    res.send([header, ...rows].join("\n"));
    return;
  }

  // PDF
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
    info: { Title: "Repairs Report", Author: "PerifEye" },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=repairs.pdf");
  doc.pipe(res);

  doc.fontSize(18).text("Repairs Report", { align: "left" });
  doc.fontSize(10).text(`${repairs.length} repairs — ${new Date().toLocaleDateString()}`, { align: "left" });
  doc.moveDown(0.5);

  const columns = [
    { key: "title", label: "Title", width: 160 },
    { key: "description", label: "Description", width: 180 },
    { key: "severity", label: "Severity", width: 70 },
    { key: "status", label: "Status", width: 90 },
    { key: "item", label: "Item", width: 110 },
    { key: "created", label: "Created", width: 70 },
    { key: "updated", label: "Updated", width: 70 },
    { key: "resolved", label: "Resolved", width: 70 },
  ];

  const tableTop = doc.y + 8;
  drawTable(doc, columns, tableTop, repairs.map((r) => ({
    title: r.title,
    description: (r.description || "").slice(0, 80),
    severity: r.severity || "",
    status: r.status,
    item: r.item?.name || "",
    created: formatDate(r.createdAt),
    updated: formatDate(r.updatedAt),
    resolved: formatDate(r.resolvedAt),
  })));

  doc.end();
});

// ── PDF Table Helper ─────────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  width: number;
}

function drawTable(doc: InstanceType<typeof PDFDocument>, columns: Column[], top: number, rows: Record<string, string>[]) {
  const rowHeight = 18;
  const headerColor = "#f3f4f6";
  const borderColor = "#d1d5db";
  let y = top;

  // Header
  doc.fontSize(8).font("Helvetica-Bold");
  let x = doc.page.margins.left;

  // Header background
  doc.save();
  doc.fillColor(headerColor).rect(x, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill();
  doc.restore();

  for (const col of columns) {
    doc.fillColor("#374151").text(col.label, x + 4, y + 5, { width: col.width - 8, align: "left" });
    x += col.width;
  }

  y += rowHeight;

  // Rows
  doc.font("Helvetica").fontSize(8);
  for (const row of rows) {
    // Check if new page needed
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    x = doc.page.margins.left;

    // Row background (alternating)
    const rowIndex = rows.indexOf(row);
    if (rowIndex % 2 === 1) {
      doc.save();
      doc.fillColor("#f9fafb").rect(x, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill();
      doc.restore();
    }

    for (const col of columns) {
      const val = row[col.key] || "";
      const display = val.length > 50 ? val.slice(0, 47) + "..." : val;
      doc.fillColor("#111827").text(display, x + 4, y + 5, { width: col.width - 8, align: "left" });
      x += col.width;
    }

    // Bottom border
    doc.save();
    doc.lineWidth(0.5).strokeColor(borderColor).moveTo(doc.page.margins.left, y + rowHeight).lineTo(x, y + rowHeight).stroke();
    doc.restore();

    y += rowHeight;
  }
}
