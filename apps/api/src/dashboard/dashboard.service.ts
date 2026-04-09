import { Injectable } from "@nestjs/common";
import { Prisma, RequestStatus, SapJobStatus } from "@prisma/client";
import * as ExcelJS from "exceljs";

import { PrismaService } from "../prisma/prisma.service";
import { DashboardDetailTableQueryDto } from "./dto/dashboard-detail-table-query.dto";
import { DashboardExportFormat, DashboardExportQueryDto } from "./dto/dashboard-export-query.dto";
import { DashboardSummaryQueryDto } from "./dto/dashboard-summary-query.dto";

const STATUS_ORDER: RequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED"];

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LABELING: "라벨링",
  REPACK: "재포장",
};

interface VendorWorkloadRow {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface DashboardSummaryResult {
  range: { from: string; to: string };
  requestStatus: Record<RequestStatus, number>;
  monthlyTrend: Array<{ month: string; count: number }>;
  vendorWorkload: VendorWorkloadRow[];
  sapStatus: Record<SapJobStatus, number>;
}

interface DashboardDetailRow {
  id: string;
  title: string;
  requestType: string;
  status: RequestStatus;
  dueDate: string;
  description: string;
  requester: {
    id: string;
    name: string;
    email: string;
  };
  assignedVendor: {
    id: string;
    code: string;
    name: string;
  } | null;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: DashboardSummaryQueryDto): Promise<DashboardSummaryResult> {
    const range = this.resolveRange(query);

    const requestStatus = await this.getRequestStatusSummary(range);
    const monthlyTrend = await this.getMonthlyTrend(range);
    const vendorWorkload = await this.getVendorWorkload(range);
    const sapStatus = await this.getSapSummary(range);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      requestStatus,
      monthlyTrend,
      vendorWorkload,
      sapStatus,
    };
  }

  async getDetailTable(query: DashboardDetailTableQueryDto) {
    const take = Math.min(query.limit ?? 500, 5000);
    const rows = await this.getDetailRows(query, take);
    return {
      count: rows.length,
      items: rows,
    };
  }

  async exportDashboard(query: DashboardExportQueryDto) {
    const format = query.format ?? DashboardExportFormat.XLSX;
    const summary = await this.getSummary(query);
    const detailRows = await this.getDetailRows(query, 5000);
    const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
    const baseName = `dashboard-${timestamp}`;

    if (format === DashboardExportFormat.XLSX) {
      const content = await this.toDashboardXlsxBuffer(summary, detailRows);
      return {
        fileName: `${baseName}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content,
      };
    }

    const content = Buffer.from(this.toDashboardCsv(summary, detailRows), "utf-8");
    return {
      fileName: `${baseName}.csv`,
      mimeType: "text/csv; charset=utf-8",
      content,
    };
  }

  private resolveRange(query: DashboardSummaryQueryDto) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const to = query.to ? new Date(query.to) : now;
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  private createdAtRangeWhere(range: { from: Date; to: Date }) {
    return {
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    };
  }

  private async getRequestStatusSummary(range: { from: Date; to: Date }) {
    const groups = await this.prisma.vasRequest.groupBy({
      by: ["status"],
      where: this.createdAtRangeWhere(range),
      _count: { _all: true },
    });

    const summary: Record<RequestStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };

    groups.forEach((group) => {
      summary[group.status] = group._count._all;
    });

    return summary;
  }

  private async getMonthlyTrend(range: { from: Date; to: Date }) {
    const rows = await this.prisma.vasRequest.findMany({
      where: this.createdAtRangeWhere(range),
      select: {
        createdAt: true,
      },
    });

    const trendMap = new Map<string, number>();
    rows.forEach((row) => {
      const key = monthKey(row.createdAt);
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    });

    return [...trendMap.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private async getVendorWorkload(range: { from: Date; to: Date }) {
    const groups = await this.prisma.vasRequest.groupBy({
      by: ["assignedVendorId", "status"],
      where: {
        assignedVendorId: { not: null },
        ...this.createdAtRangeWhere(range),
      },
      _count: { _all: true },
    });

    const vendorIds = [...new Set(groups.map((group) => group.assignedVendorId).filter(Boolean))];
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: vendorIds as string[] } },
      select: { id: true, name: true, code: true },
    });
    const vendorMap = new Map(vendors.map((vendor) => [vendor.id, vendor]));

    const workloadMap = new Map<string, VendorWorkloadRow>();
    groups.forEach((group) => {
      if (!group.assignedVendorId) {
        return;
      }
      const vendorMeta = vendorMap.get(group.assignedVendorId);
      if (!vendorMeta) {
        return;
      }

      const current = workloadMap.get(group.assignedVendorId) ?? {
        vendorId: group.assignedVendorId,
        vendorName: vendorMeta.name,
        vendorCode: vendorMeta.code,
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
      };

      current.total += group._count._all;
      if (group.status === RequestStatus.PENDING || group.status === RequestStatus.APPROVED) {
        current.pending += group._count._all;
      }
      if (group.status === RequestStatus.IN_PROGRESS) {
        current.inProgress += group._count._all;
      }
      if (group.status === RequestStatus.COMPLETED) {
        current.completed += group._count._all;
      }

      workloadMap.set(group.assignedVendorId, current);
    });

    return [...workloadMap.values()].sort((a, b) => b.total - a.total);
  }

  private async getSapSummary(range: { from: Date; to: Date }) {
    const groups = await this.prisma.sapJobLog.groupBy({
      by: ["status"],
      where: this.createdAtRangeWhere(range),
      _count: { _all: true },
    });

    const summary: Record<SapJobStatus, number> = {
      PENDING: 0,
      SUCCESS: 0,
      FAILED: 0,
    };
    groups.forEach((group) => {
      summary[group.status] = group._count._all;
    });
    return summary;
  }

  private async getDetailRows(query: DashboardDetailTableQueryDto, take: number) {
    const range = this.resolveRange(query);
    const where: Prisma.VasRequestWhereInput = this.createdAtRangeWhere(range);
    if (query.status) {
      where.status = query.status;
    }

    const rows = await this.prisma.vasRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedVendor: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      requestType: row.requestType,
      status: row.status,
      dueDate: row.dueDate.toISOString(),
      description: row.description ?? "",
      requester: {
        id: row.requester.id,
        name: row.requester.name,
        email: row.requester.email,
      },
      assignedVendor: row.assignedVendor
        ? {
            id: row.assignedVendor.id,
            code: row.assignedVendor.code,
            name: row.assignedVendor.name,
          }
        : null,
    }));
  }

  private toDashboardCsv(summary: DashboardSummaryResult, detailRows: DashboardDetailRow[]) {
    const statusRows = STATUS_ORDER.map((status) => [this.requestStatusLabel(status), String(summary.requestStatus[status] ?? 0)]);

    const vendorRows = summary.vendorWorkload.map((vendor) => [
      vendor.vendorName,
      String(vendor.total),
      String(vendor.pending),
      String(vendor.inProgress),
      String(vendor.completed),
    ]);

    const detailRowsCsv = detailRows.map((row) => [
      row.title,
      this.requestStatusLabel(row.status),
      this.requestTypeLabel(row.requestType),
      row.requester.name,
      row.assignedVendor?.name ?? "",
      this.formatDate(row.dueDate),
      row.description,
    ]);

    const blocks = [
      this.csvBlock("요청 상태표", ["상태", "건수"], statusRows),
      this.csvBlock("업체 작업량표", ["업체", "전체", "대기", "진행중", "완료"], vendorRows),
      this.csvBlock(
        "VAS 상세표",
        ["제목", "상태", "요청유형", "요청자", "현재 배정 업체", "마감일", "상세 설명"],
        detailRowsCsv,
      ),
    ];

    return blocks.join("\n\n");
  }

  private csvBlock(title: string, headers: string[], rows: string[][]) {
    const header = headers.map((value) => this.csvCell(value)).join(",");
    const body = rows.map((row) => row.map((value) => this.csvCell(value)).join(",")).join("\n");
    return `${this.csvCell(title)}\n${header}${body ? `\n${body}` : ""}`;
  }

  private csvCell(value: string) {
    return `"${String(value).replaceAll("\"", "\"\"")}"`;
  }

  private async toDashboardXlsxBuffer(summary: DashboardSummaryResult, detailRows: DashboardDetailRow[]) {
    const workbook = new ExcelJS.Workbook();

    const requestStatusSheet = workbook.addWorksheet("요청상태");
    requestStatusSheet.columns = [
      { header: "상태", key: "status", width: 18 },
      { header: "건수", key: "count", width: 12 },
    ];
    STATUS_ORDER.forEach((status) => {
      requestStatusSheet.addRow({
        status: this.requestStatusLabel(status),
        count: summary.requestStatus[status] ?? 0,
      });
    });
    requestStatusSheet.views = [{ state: "frozen", ySplit: 1 }];
    requestStatusSheet.autoFilter = "A1:B1";
    requestStatusSheet.getRow(1).font = { bold: true };

    const vendorSheet = workbook.addWorksheet("업체작업량");
    vendorSheet.columns = [
      { header: "업체", key: "vendorName", width: 24 },
      { header: "전체", key: "total", width: 12 },
      { header: "대기", key: "pending", width: 12 },
      { header: "진행중", key: "inProgress", width: 12 },
      { header: "완료", key: "completed", width: 12 },
    ];
    summary.vendorWorkload.forEach((vendor) => {
      vendorSheet.addRow({
        vendorName: `${vendor.vendorName} (${vendor.vendorCode})`,
        total: vendor.total,
        pending: vendor.pending,
        inProgress: vendor.inProgress,
        completed: vendor.completed,
      });
    });
    vendorSheet.views = [{ state: "frozen", ySplit: 1 }];
    vendorSheet.autoFilter = "A1:E1";
    vendorSheet.getRow(1).font = { bold: true };

    const detailSheet = workbook.addWorksheet("VAS상세표");
    detailSheet.columns = [
      { header: "제목", key: "title", width: 42 },
      { header: "상태", key: "status", width: 14 },
      { header: "요청유형", key: "requestType", width: 16 },
      { header: "요청자", key: "requesterName", width: 22 },
      { header: "현재 배정 업체", key: "vendorName", width: 22 },
      { header: "마감일", key: "dueDate", width: 14 },
      { header: "상세 설명", key: "description", width: 52 },
    ];
    detailRows.forEach((row) => {
      detailSheet.addRow({
        title: row.title,
        status: this.requestStatusLabel(row.status),
        requestType: this.requestTypeLabel(row.requestType),
        requesterName: row.requester.name,
        vendorName: row.assignedVendor?.name ?? "",
        dueDate: this.formatDate(row.dueDate),
        description: row.description,
      });
    });
    detailSheet.views = [{ state: "frozen", ySplit: 1 }];
    detailSheet.autoFilter = "A1:G1";
    detailSheet.getRow(1).font = { bold: true };
    detailSheet.getColumn("description").alignment = { vertical: "top", wrapText: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }

  private requestStatusLabel(status: RequestStatus) {
    return REQUEST_STATUS_LABEL[status] ?? status;
  }

  private requestTypeLabel(requestType: string) {
    return REQUEST_TYPE_LABEL[requestType] ?? requestType;
  }

  private formatDate(isoDate: string) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return isoDate;
    }
    return date.toISOString().slice(0, 10);
  }
}
