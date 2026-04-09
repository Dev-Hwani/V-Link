import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notificationService.listMyNotifications(user.sub, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.getUnreadCount(user.sub);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.notificationService.markAsRead(user.sub, id);
  }

  @Patch("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllAsRead(user.sub);
  }
}

