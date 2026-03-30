import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RequestStatus, Role } from "@prisma/client";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { SapService } from "../sap/sap.service";
import { ApproveRequestDto } from "./dto/approve-request.dto";
import { CompleteRequestDto } from "./dto/complete-request.dto";
import { CreateRequestDto } from "./dto/create-request.dto";
import { RejectRequestDto } from "./dto/reject-request.dto";

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sapService: SapService,
  ) {}

  async create(user: AuthUser, dto: CreateRequestDto) {
    if (user.role === Role.VENDOR) {
      throw new ForbiddenException("Vendor users cannot create requests");
    }

    return this.prisma.vasRequest.create({
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
      },
      orderBy: {
        createdAt: "desc",
      },
    });
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
      },
    });

    await this.sapService.enqueuePreStockOrder(updated.id);

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

    return this.prisma.vasRequest.update({
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

    return this.prisma.vasRequest.update({
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
}

