import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type DeviceRegistration,
  ListNotificationsQuerySchema,
  type NotificationPage,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  RegisterDeviceSchema,
} from '@delyva/contracts';
import { z } from 'zod';
import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import { AuthGuard, CurrentPrincipal } from '../../../shared/auth/auth.guard.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import {
  GetPreferences,
  RegisterDevice,
  UpdatePreferences,
} from '../application/device-and-preferences.use-cases.js';
import { ListInbox, MarkNotificationRead } from '../application/inbox.use-cases.js';

const IdParam = z.uuid();

/**
 * Inbox, preferences and device registration (v1). All routes act on the caller only.
 * Writes are naturally idempotent (upserts / set-once read flag), so no Idempotency-Key is required.
 */
@Controller()
@UseGuards(AuthGuard)
export class NotificationsController {
  /** Injected use cases. */
  constructor(
    private readonly listInbox: ListInbox,
    private readonly markRead: MarkNotificationRead,
    private readonly getPrefs: GetPreferences,
    private readonly updatePrefs: UpdatePreferences,
    private readonly registerDevice: RegisterDevice,
  ) {}

  /** GET /v1/notifications */
  @Get('v1/notifications')
  list(
    @CurrentPrincipal() me: Principal,
    @Query(new ZodBodyPipe(ListNotificationsQuerySchema))
    query: z.infer<typeof ListNotificationsQuerySchema>,
  ): Promise<NotificationPage> {
    return this.listInbox.execute(me.userId, query);
  }

  /** POST /v1/notifications/{id}/read */
  @Post('v1/notifications/:id/read')
  @HttpCode(204)
  async read(
    @CurrentPrincipal() me: Principal,
    @Param('id', new ZodBodyPipe(IdParam)) id: string,
  ): Promise<void> {
    await this.markRead.execute(me.userId, id);
  }

  /** GET /v1/notifications/preferences */
  @Get('v1/notifications/preferences')
  preferences(@CurrentPrincipal() me: Principal): Promise<NotificationPreferences> {
    return this.getPrefs.execute(me.userId);
  }

  /** PUT /v1/notifications/preferences */
  @Put('v1/notifications/preferences')
  update(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodBodyPipe(NotificationPreferencesSchema)) body: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    return this.updatePrefs.execute(me.userId, body.preferences);
  }

  /** POST /v1/devices — binds the push token to (user, device id from the token). */
  @Post('v1/devices')
  @HttpCode(200)
  device(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodBodyPipe(RegisterDeviceSchema)) body: z.infer<typeof RegisterDeviceSchema>,
  ): Promise<DeviceRegistration> {
    return this.registerDevice.execute({ userId: me.userId, deviceId: me.deviceId, ...body });
  }
}
