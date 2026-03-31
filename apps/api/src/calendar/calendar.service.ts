import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, RequestStatus, Role } from "@prisma/client";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarEventsQueryDto } from "./dto/calendar-events-query.dto";

const STATUS_COLORS: Record<RequestStatus, { bg: string; border: string }> = {
  PENDING: { bg: "#7b8492", border: "#69717d" },
  APPROVED: { bg: "#2f71d8", border: "#245bb0" },
  REJECTED: { bg: "#cf4b4b", border: "#a73636" },
  IN_PROGRESS: { bg: "#f0a530", border: "#cf8b23" },
  COMPLETED: { bg: "#269f6f", border: "#1f835c" },
};

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(user: AuthUser, query: CalendarEventsQueryDto) {
    const where: Prisma.VasRequestWhereInput = {};

    if (query.from || query.to) {
      where.dueDate = {};
      if (query.from) {
        where.dueDate.gte = new Date(query.from);
      }
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        where.dueDate.lte = end;
      }
    }

    if (query.status) {
      where.status = query.status;
    }

    if (user.role === Role.ADMIN) {
      if (query.vendorId) {
        where.assignedVendorId = query.vendorId;
      }
    }

    if (user.role === Role.REQUESTER) {
      where.requesterId = user.sub;
    }

    if (user.role === Role.VENDOR) {
      if (!user.vendorId) {
        throw new ForbiddenException("Vendor user is missing vendorId");
      }
      where.assignedVendorId = user.vendorId;
    }

    const requests = await this.prisma.vasRequest.findMany({
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
      orderBy: {
        dueDate: "asc",
      },
    });

    return requests.map((request) => {
      const color = STATUS_COLORS[request.status];

      return {
        id: request.id,
        title: `[${request.status}] ${request.title}`,
        start: request.dueDate.toISOString(),
        allDay: true,
        backgroundColor: color.bg,
        borderColor: color.border,
        extendedProps: {
          requestType: request.requestType,
          team: request.team,
          status: request.status,
          description: request.description,
          requester: request.requester,
          vendor: request.assignedVendor,
        },
      };
    });
  }

  async getVendorOptions(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.vendor.findMany({
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { name: "asc" },
      });
    }

    if (user.role === Role.VENDOR && user.vendorId) {
      return this.prisma.vendor.findMany({
        where: { id: user.vendorId },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });
    }

    return [];
  }
}

