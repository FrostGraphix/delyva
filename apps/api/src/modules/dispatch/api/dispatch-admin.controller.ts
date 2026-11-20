import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  type AdminDispatchRiderList,
  IdParamSchema,
  type ManualAssign,
  ManualAssignSchema,
  type Trip,
} from '@delyva/contracts';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { OpsDispatch } from '../application/ops-dispatch.use-cases.js';

/** Ops dispatch tooling (roles `ops`, `super_admin`). */
@Controller('v1/admin/dispatch')
@UseGuards(AuthGuard)
@Roles('ops', 'super_admin')
export class DispatchAdminController {
  /** @param ops ops use cases */
  constructor(private readonly ops: OpsDispatch) {}

  /** GET /v1/admin/dispatch/riders */
  @Get('riders')
  riders(@Principal() me: AuthPrincipal): Promise<AdminDispatchRiderList> {
    return this.ops.riders(me);
  }

  /** POST /v1/admin/dispatch/orders/{orderId}/assign (Idempotency-Key + reason required) */
  @Post('orders/:orderId/assign')
  @HttpCode(200)
  @Idempotent()
  assign(
    @Principal() me: AuthPrincipal,
    @Param('orderId', new ZodBodyPipe(IdParamSchema)) orderId: string,
    @Body(new ZodBodyPipe(ManualAssignSchema)) body: ManualAssign,
  ): Promise<Trip> {
    return this.ops.assign(me, orderId, body.riderId, body.reason);
  }
}
