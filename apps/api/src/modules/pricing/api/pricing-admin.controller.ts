import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateFeeRule,
  CreateFeeRuleSchema,
  type CreatePromo,
  CreatePromoSchema,
  type CreateSurgeRule,
  CreateSurgeRuleSchema,
  type FeeRule,
  type FeeRuleList,
  IdParamSchema,
  type Promo,
  type PromoList,
  type SurgeRule,
  type SurgeRuleList,
  type UpdateFeeRule,
  UpdateFeeRuleSchema,
  type UpdatePromo,
  UpdatePromoSchema,
  type UpdateSurgeRule,
  UpdateSurgeRuleSchema,
} from '@delyva/contracts';
import { AuthGuard, Roles } from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { PricingAdmin } from '../application/pricing-admin.js';
import { toFeeRuleDto, toPromoDto, toSurgeRuleDto } from './pricing.mappers.js';

const idPipe = new ZodBodyPipe(IdParamSchema);

/** Admin management of fee rules, surge rules and promos. Roles: ops, super_admin. */
@Controller('v1/admin')
@UseGuards(AuthGuard)
@Roles('ops', 'super_admin')
export class PricingAdminController {
  /** @param admin admin use cases */
  constructor(private readonly admin: PricingAdmin) {}

  /** GET /v1/admin/fee-rules */
  @Get('fee-rules')
  async listFeeRules(): Promise<FeeRuleList> {
    return { items: (await this.admin.listFeeRules()).map(toFeeRuleDto) };
  }

  /** POST /v1/admin/fee-rules (Idempotency-Key required). */
  @Post('fee-rules')
  @HttpCode(201)
  @Idempotent()
  async createFeeRule(
    @Body(new ZodBodyPipe(CreateFeeRuleSchema)) body: CreateFeeRule,
  ): Promise<FeeRule> {
    return toFeeRuleDto(await this.admin.createFeeRule(body));
  }

  /** PATCH /v1/admin/fee-rules/{id} */
  @Patch('fee-rules/:id')
  async updateFeeRule(
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(UpdateFeeRuleSchema)) body: UpdateFeeRule,
  ): Promise<FeeRule> {
    return toFeeRuleDto(await this.admin.updateFeeRule(id, body));
  }

  /** GET /v1/admin/surge-rules */
  @Get('surge-rules')
  async listSurgeRules(): Promise<SurgeRuleList> {
    return { items: (await this.admin.listSurgeRules()).map(toSurgeRuleDto) };
  }

  /** POST /v1/admin/surge-rules (Idempotency-Key required). */
  @Post('surge-rules')
  @HttpCode(201)
  @Idempotent()
  async createSurgeRule(
    @Body(new ZodBodyPipe(CreateSurgeRuleSchema)) body: CreateSurgeRule,
  ): Promise<SurgeRule> {
    return toSurgeRuleDto(await this.admin.createSurgeRule(body));
  }

  /** PATCH /v1/admin/surge-rules/{id} */
  @Patch('surge-rules/:id')
  async updateSurgeRule(
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(UpdateSurgeRuleSchema)) body: UpdateSurgeRule,
  ): Promise<SurgeRule> {
    return toSurgeRuleDto(await this.admin.updateSurgeRule(id, body));
  }

  /** GET /v1/admin/promos */
  @Get('promos')
  async listPromos(): Promise<PromoList> {
    return { items: (await this.admin.listPromos()).map(toPromoDto) };
  }

  /** POST /v1/admin/promos (Idempotency-Key required). */
  @Post('promos')
  @HttpCode(201)
  @Idempotent()
  async createPromo(@Body(new ZodBodyPipe(CreatePromoSchema)) body: CreatePromo): Promise<Promo> {
    return toPromoDto(await this.admin.createPromo(body));
  }

  /** PATCH /v1/admin/promos/{id} */
  @Patch('promos/:id')
  async updatePromo(
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(UpdatePromoSchema)) body: UpdatePromo,
  ): Promise<Promo> {
    return toPromoDto(await this.admin.updatePromo(id, body));
  }
}
