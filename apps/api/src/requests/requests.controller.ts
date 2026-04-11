import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { Response } from "express";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { requestFileStorage } from "../common/upload/request-file-storage";
import { ApproveRequestDto } from "./dto/approve-request.dto";
import { CompleteRequestDto } from "./dto/complete-request.dto";
import { CreateRequestDto } from "./dto/create-request.dto";
import { ExportAdminRequestsQueryDto } from "./dto/export-admin-requests-query.dto";
import { ListAdminRequestsQueryDto } from "./dto/list-admin-requests-query.dto";
import { RejectRequestDto } from "./dto/reject-request.dto";
import { RequestsService } from "./requests.service";

@Controller("requests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.REQUESTER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requestsService.create(user, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.REQUESTER, Role.VENDOR)
  list(@CurrentUser() user: AuthUser) {
    return this.requestsService.list(user);
  }

  @Get("admin/assignees")
  @Roles(Role.ADMIN, Role.REQUESTER)
  listTargetAdmins() {
    return this.requestsService.listTargetAdmins();
  }

  @Get("admin/table")
  @Roles(Role.ADMIN)
  listAdminTable(@CurrentUser() user: AuthUser, @Query() query: ListAdminRequestsQueryDto) {
    return this.requestsService.listAdminTable(user, query);
  }

  @Get("admin/pending-count")
  @Roles(Role.ADMIN)
  getAdminPendingCount(@CurrentUser() user: AuthUser) {
    return this.requestsService.getAdminPendingCount(user);
  }

  @Get("admin/export")
  @Roles(Role.ADMIN)
  async exportAdminTable(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportAdminRequestsQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.requestsService.exportAdminTable(user, query);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=\"${file.fileName}\"`);
    res.send(file.content);
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.REQUESTER, Role.VENDOR)
  detail(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.getById(user, id);
  }

  @Patch(":id/approve")
  @Roles(Role.ADMIN)
  approve(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequestDto,
  ) {
    return this.requestsService.approve(user, id, dto);
  }

  @Patch(":id/reject")
  @Roles(Role.ADMIN)
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.requestsService.reject(user, id, dto);
  }

  @Patch(":id/start")
  @Roles(Role.VENDOR, Role.ADMIN)
  start(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.startWork(user, id);
  }

  @Patch(":id/complete")
  @Roles(Role.VENDOR, Role.ADMIN)
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteRequestDto,
  ) {
    return this.requestsService.complete(user, id, dto);
  }

  @Post(":id/attachments")
  @Roles(Role.ADMIN, Role.REQUESTER, Role.VENDOR)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: requestFileStorage,
      limits: {
        fileSize: 500 * 1024 * 1024,
      },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.requestsService.attachFile(user, id, file);
  }
}
