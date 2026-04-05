import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RequestStatus, Role } from "@prisma/client";
import ExcelJS from "exceljs";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { SapService } from "../sap/sap.service";
import { ApproveRequestDto } from "./dto/approve-request.dto";
import { CompleteRequestDto } from "./dto/complete-request.dto";
import { CreateRequestDto } from "./dto/create-request.dto";
import { AdminRequestExportFormat, ExportAdminRequestsQueryDto } from "./dto/export-admin-requests-query.dto";
import { ListAdminRequestsQueryDto } from "./dto/list-admin-requests-query.dto";
import { RejectRequestDto } from "./dto/reject-request.dto";

interface AdminRequestTableRow {
  id: string;
  title: string;
  requestType: string;
  team: string;
  status: RequestStatus;
  dueDate: string;
  createdAt: string;
  completedAt: string;
  rejectedReason: string;
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
  attachmentCount: number;
  historyCount: number;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sapService: SapService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(user: AuthUser, dto: CreateRequestDto) {
    if (user.role === Role.VENDOR) {
      throw new ForbiddenException("Vendor users cannot create requests");
    }

    const created = await this.prisma.vasRequest.create({
      data: {
        requestType: dto.requestType,
        title: dto.title,
        dueDate: new Date(dto.dueDate),
        team: dto.team,
        description: dto.description,
        requesterId: user.sub,
        histories: {
          create: {
            toStatus: RequestStatus.PENDING,
            actorId: user.sub,
          },
        },
      },
      include: {
        attachments: true,
        histories: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    void this.notificationService.notifyRequestLifecycle({
      event: "REQUEST_CREATED",
      requestId: created.id,
      title: created.title,
      status: created.status,
      team: created.team,
      dueDate: created.dueDate,
    });

    return created;
  }

  async list(user: AuthUser) {
    const where: Prisma.VasRequestWhereInput = {};

    if (user.role === Role.REQUESTER) {
      where.requesterId = user.sub;
    }

    if (user.role === Role.VENDOR) {
      if (!user.vendorId) {
        throw new ForbiddenException("Vendor user is missing vendorId");
      }
      where.assignedVendorId = user.vendorId;
    }

    return this.prisma.vasRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        assignedVendor: true,
        attachments: true,
        assignments: {
          orderBy: { createdAt: "desc" },
          include: {
            vendor: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async listAdminTable(query: ListAdminRequestsQueryDto) {
    const take = Math.min(query.limit ?? 500, 5000);
    const rows = await this.findAdminTableRows(query, take);
    return {
      count: rows.length,
      items: rows,
    };
  }

  async exportAdminTable(query: ExportAdminRequestsQueryDto) {
    const format = query.format ?? AdminRequestExportFormat.XLSX;
    const rows = await this.findAdminTableRows(query, 5000);
    const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
    const baseName = `vas-requests-${timestamp}`;

    if (format === AdminRequestExportFormat.XLSX) {
      const content = await this.toAdminXlsxBuffer(rows);
      return {
        fileName: `${baseName}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content,
      };
    }

    const content = Buffer.from(this.toAdminCsv(rows), "utf-8");
    return {
      fileName: `${baseName}.csv`,
      mimeType: "text/csv; charset=utf-8",
      content,
    };
  }

  async getById(user: AuthUser, requestId: string) {
    const request = await this.prisma.vasRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        assignedVendor: true,
        attachments: true,
        assignments: {
          orderBy: { createdAt: "desc" },
          include: {
            vendor: true,
          },
        },
        histories: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (user.role === Role.REQUESTER && request.requesterId !== user.sub) {
      throw new ForbiddenException("You can only access your own requests");
    }

    if (user.role === Role.VENDOR && request.assignedVendorId !== user.vendorId) {
      throw new ForbiddenException("You can only access your assigned requests");
    }

    return request;
  }

  async approve(user: AuthUser, requestId: string, dto: ApproveRequestDto) {
    const request = await this.prisma.vasRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException("Only pending requests can be approved");
    }

    const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });

    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }

    const updated = await this.prisma.vasRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.APPROVED,
        assignedVendorId: dto.vendorId,
        approvedById: user.sub,
        rejectedReason: null,
        assignments: {
          create: {
            vendorId: dto.vendorId,
            assignedById: user.sub,
          },
        },
        histories: {
          create: {
            fromStatus: request.status,
            toStatus: RequestStatus.APPROVED,
            actorId: user.sub,
          },
        },
      },
      include: {
        assignedVendor: true,
        assignments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    await this.sapService.enqueuePreStockOrder(updated.id);

    void this.notificationService.notifyRequestLifecycle({
      event: "REQUEST_APPROVED",
      requestId: updated.id,
      title: updated.title,
      status: updated.status,
      team: updated.team,
      dueDate: updated.dueDate,
      vendorName: updated.assignedVendor?.name ?? null,
    });

    return updated;
  }

  async reject(user: AuthUser, requestId: string, dto: RejectRequestDto) {
    const request = await this.prisma.vasRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException("Only pending requests can be rejected");
    }

    const updated = await this.prisma.vasRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        rejectedReason: dto.reason,
        approvedById: user.sub,
        histories: {
          create: {
            fromStatus: request.status,
            toStatus: RequestStatus.REJECTED,
            reason: dto.reason,
            actorId: user.sub,
          },
        },
      },
    });

    void this.notificationService.notifyRequestLifecycle({
      event: "REQUEST_REJECTED",
      requestId: updated.id,
      title: updated.title,
      status: updated.status,
      team: updated.team,
      dueDate: updated.dueDate,
      reason: updated.rejectedReason,
    });

    return updated;
  }

  async startWork(user: AuthUser, requestId: string) {
    const request = await this.prisma.vasRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (!request.assignedVendorId) {
      throw new BadRequestException("Request has no assigned vendor");
    }

    if (user.role === Role.VENDOR && user.vendorId !== request.assignedVendorId) {
      throw new ForbiddenException("You can only start your own assigned requests");
    }

    if (request.status !== RequestStatus.APPROVED && request.status !== RequestStatus.IN_PROGRESS) {
      throw new ConflictException("Request is not in an executable state");
    }

    if (request.status === RequestStatus.IN_PROGRESS) {
      return request;
    }

    const updated = await this.prisma.vasRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.IN_PROGRESS,
        histories: {
          create: {
            fromStatus: request.status,
            toStatus: RequestStatus.IN_PROGRESS,
            actorId: user.sub,
          },
        },
      },
    });

    void this.notificationService.notifyRequestLifecycle({
      event: "REQUEST_STARTED",
      requestId: updated.id,
      title: updated.title,
      status: updated.status,
      team: updated.team,
      dueDate: updated.dueDate,
    });

    return updated;
  }

  async complete(user: AuthUser, requestId: string, dto: CompleteRequestDto) {
    const request = await this.prisma.vasRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (!request.assignedVendorId) {
      throw new BadRequestException("Request has no assigned vendor");
    }

    if (user.role === Role.VENDOR && user.vendorId !== request.assignedVendorId) {
      throw new ForbiddenException("You can only complete your own assigned requests");
    }

    if (request.status !== RequestStatus.APPROVED && request.status !== RequestStatus.IN_PROGRESS) {
      throw new ConflictException("Only approved or in-progress requests can be completed");
    }

    const updated = await this.prisma.vasRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.COMPLETED,
        completedAt: new Date(),
        histories: {
          create: {
            fromStatus: request.status,
            toStatus: RequestStatus.COMPLETED,
            reason: dto.note,
            actorId: user.sub,
          },
        },
      },
    });

    await this.sapService.enqueueCompletionOrder(updated.id);

    void this.notificationService.notifyRequestLifecycle({
      event: "REQUEST_COMPLETED",
      requestId: updated.id,
      title: updated.title,
      status: updated.status,
      team: updated.team,
      dueDate: updated.dueDate,
      reason: dto.note ?? null,
    });

    return updated;
  }

  async attachFile(user: AuthUser, requestId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("file is required");
    }

    const request = await this.prisma.vasRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (user.role === Role.REQUESTER && request.requesterId !== user.sub) {
      throw new ForbiddenException("Requesters can upload only to their own requests");
    }

    if (user.role === Role.VENDOR && request.assignedVendorId !== user.vendorId) {
      throw new ForbiddenException("Vendors can upload only to assigned requests");
    }

    return this.prisma.attachment.create({
      data: {
        requestId,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
      },
    });
  }

  private async findAdminTableRows(query: ListAdminRequestsQueryDto, take: number) {
    const where = this.buildAdminTableWhere(query);

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
        _count: {
          select: {
            attachments: true,
            histories: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take,
    });

    return requests.map((request) => ({
      id: request.id,
      title: request.title,
      requestType: request.requestType,
      team: request.team,
      status: request.status,
      dueDate: request.dueDate.toISOString(),
      createdAt: request.createdAt.toISOString(),
      completedAt: request.completedAt ? request.completedAt.toISOString() : "",
      rejectedReason: request.rejectedReason ?? "",
      description: request.description ?? "",
      requester: {
        id: request.requester.id,
        name: request.requester.name,
        email: request.requester.email,
      },
      assignedVendor: request.assignedVendor
        ? {
            id: request.assignedVendor.id,
            code: request.assignedVendor.code,
            name: request.assignedVendor.name,
          }
        : null,
      attachmentCount: request._count.attachments,
      historyCount: request._count.histories,
    }));
  }

  private buildAdminTableWhere(query: ListAdminRequestsQueryDto): Prisma.VasRequestWhereInput {
    const where: Prisma.VasRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.vendorId) {
      where.assignedVendorId = query.vendorId;
    }

    if (query.requesterId) {
      where.requesterId = query.requesterId;
    }

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

    if (query.search?.trim()) {
      const keyword = query.search.trim();
      where.OR = [
        { title: { contains: keyword, mode: "insensitive" } },
        { team: { contains: keyword, mode: "insensitive" } },
        { requestType: { contains: keyword, mode: "insensitive" } },
        { description: { contains: keyword, mode: "insensitive" } },
        { requester: { name: { contains: keyword, mode: "insensitive" } } },
        { requester: { email: { contains: keyword, mode: "insensitive" } } },
        { assignedVendor: { name: { contains: keyword, mode: "insensitive" } } },
        { assignedVendor: { code: { contains: keyword, mode: "insensitive" } } },
      ];
    }

    return where;
  }

  private toAdminCsv(rows: AdminRequestTableRow[]) {
    const headers = [
      "id",
      "status",
      "requestType",
      "title",
      "team",
      "dueDate",
      "createdAt",
      "completedAt",
      "requesterName",
      "requesterEmail",
      "vendorCode",
      "vendorName",
      "attachmentCount",
      "historyCount",
      "rejectedReason",
      "description",
    ];

    const lines = rows.map((row) =>
      [
        row.id,
        row.status,
        row.requestType,
        row.title,
        row.team,
        row.dueDate,
        row.createdAt,
        row.completedAt,
        row.requester.name,
        row.requester.email,
        row.assignedVendor?.code ?? "",
        row.assignedVendor?.name ?? "",
        String(row.attachmentCount),
        String(row.historyCount),
        row.rejectedReason,
        row.description,
      ]
        .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
        .join(","),
    );

    return `${headers.join(",")}\n${lines.join("\n")}`;
  }

  private async toAdminXlsxBuffer(rows: AdminRequestTableRow[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("vas-requests");

    sheet.columns = [
      { header: "ID", key: "id", width: 38 },
      { header: "상태", key: "status", width: 14 },
      { header: "요청유형", key: "requestType", width: 16 },
      { header: "제목", key: "title", width: 34 },
      { header: "팀", key: "team", width: 16 },
      { header: "마감일", key: "dueDate", width: 24 },
      { header: "생성일", key: "createdAt", width: 24 },
      { header: "완료일", key: "completedAt", width: 24 },
      { header: "요청자", key: "requesterName", width: 18 },
      { header: "요청자 이메일", key: "requesterEmail", width: 28 },
      { header: "업체코드", key: "vendorCode", width: 16 },
      { header: "업체명", key: "vendorName", width: 20 },
      { header: "첨부수", key: "attachmentCount", width: 10 },
      { header: "상태이력수", key: "historyCount", width: 12 },
      { header: "반려사유", key: "rejectedReason", width: 40 },
      { header: "설명", key: "description", width: 48 },
    ];

    rows.forEach((row) => {
      sheet.addRow({
        id: row.id,
        status: row.status,
        requestType: row.requestType,
        title: row.title,
        team: row.team,
        dueDate: row.dueDate,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        requesterName: row.requester.name,
        requesterEmail: row.requester.email,
        vendorCode: row.assignedVendor?.code ?? "",
        vendorName: row.assignedVendor?.name ?? "",
        attachmentCount: row.attachmentCount,
        historyCount: row.historyCount,
        rejectedReason: row.rejectedReason,
        description: row.description,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }
}

