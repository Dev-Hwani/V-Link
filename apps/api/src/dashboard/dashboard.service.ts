import { Injectable } from "@nestjs/common";
import { RequestStatus, SapJobStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { DashboardSummaryQueryDto } from "./dto/dashboard-summary-query.dto";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: DashboardSummaryQueryDto) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const to = query.to ? new Date(query.to) : now;
    to.setHours(23, 59, 59, 999);

    const requestStatusGroups = await this.prisma.vasRequest.groupBy({
      by: ["status"],
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      _count: { _all: true },
    });

    const statusSummary: Record<RequestStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };

    requestStatusGroups.forEach((group) => {
      statusSummary[group.status] = group._count._all;
    });

    const requestTrendRows = await this.prisma.vasRequest.findMany({
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      select: {
        createdAt: true,
      },
    });

    const trendMap = new Map<string, number>();
    requestTrendRows.forEach((row) => {
      const key = monthKey(row.createdAt);
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    });

    const monthlyTrend = [...trendMap.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const vendorGroups = await this.prisma.vasRequest.groupBy({
      by: ["assignedVendorId", "status"],
      where: {
        assignedVendorId: { not: null },
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      _count: { _all: true },
    });

    const vendorIds = [...new Set(vendorGroups.map((group) => group.assignedVendorId).filter(Boolean))];
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: vendorIds as string[] } },
      select: { id: true, name: true, code: true },
    });
    const vendorNameById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

    const vendorWorkloadMap = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        vendorCode: string;
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
      }
    >();

    vendorGroups.forEach((group) => {
      if (!group.assignedVendorId) {
        return;
      }

      const vendorMeta = vendorNameById.get(group.assignedVendorId);
      if (!vendorMeta) {
        return;
      }

      const current = vendorWorkloadMap.get(group.assignedVendorId) ?? {
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

      vendorWorkloadMap.set(group.assignedVendorId, current);
    });

    const vendorWorkload = [...vendorWorkloadMap.values()].sort((a, b) => b.total - a.total);

    const sapGroups = await this.prisma.sapJobLog.groupBy({
      by: ["status"],
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      _count: { _all: true },
    });

    const sapSummary: Record<SapJobStatus, number> = {
      PENDING: 0,
      SUCCESS: 0,
      FAILED: 0,
    };
    sapGroups.forEach((group) => {
      sapSummary[group.status] = group._count._all;
    });

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      requestStatus: statusSummary,
      monthlyTrend,
      vendorWorkload,
      sapStatus: sapSummary,
    };
  }
}

