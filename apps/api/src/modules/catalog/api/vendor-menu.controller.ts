import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateMenuItem as CreateMenuItemBody,
  CreateMenuItemSchema,
  type CreateModifierGroup as CreateModifierGroupBody,
  CreateModifierGroupSchema,
  type MenuItem,
  type ModifierGroup,
  type ModifierOption,
  type OpeningHoursResponse,
  type ReplaceOpeningHours as ReplaceOpeningHoursBody,
  ReplaceOpeningHoursSchema,
  type SetAvailability,
  SetAvailabilitySchema,
  type UpdateMenuItem as UpdateMenuItemBody,
  UpdateMenuItemSchema,
} from '@delyva/contracts';
import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import { AuthGuard, CurrentPrincipal, Roles } from '../../../shared/auth/auth.guard.js';
import { OwnershipGuard, OwnsResource } from '../../../shared/auth/ownership.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { CreateMenuItem } from '../application/create-menu-item.use-case.js';
import { CreateModifierGroup } from '../application/create-modifier-group.use-case.js';
import { ReplaceOpeningHours } from '../application/replace-opening-hours.use-case.js';
import { SetItemAvailability } from '../application/set-item-availability.use-case.js';
import { SetOptionAvailability } from '../application/set-option-availability.use-case.js';
import { UpdateMenuItem } from '../application/update-menu-item.use-case.js';

const uuid = new ParseUUIDPipe();

/**
 * Vendor-owner menu management. RBAC (vendor_owner | vendor_staff) + vendor membership guard;
 * use cases re-check membership and the per-role action (staff may only toggle availability).
 */
@Controller('v1/vendors/:vendorId')
@UseGuards(AuthGuard, OwnershipGuard)
@Roles('vendor_owner', 'vendor_staff')
@OwnsResource('vendorId')
export class VendorMenuController {
  /** Injected use cases. */
  constructor(
    private readonly createItem: CreateMenuItem,
    private readonly updateItem: UpdateMenuItem,
    private readonly setItemAvailability: SetItemAvailability,
    private readonly setOptionAvailability: SetOptionAvailability,
    private readonly createGroup: CreateModifierGroup,
    private readonly replaceHours: ReplaceOpeningHours,
  ) {}

  /** POST /v1/vendors/{vendorId}/items */
  @Post('items')
  @HttpCode(201)
  @Idempotent()
  create(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Body(new ZodBodyPipe(CreateMenuItemSchema)) body: CreateMenuItemBody,
  ): Promise<MenuItem> {
    return this.createItem.execute(p.userId, vendorId, body);
  }

  /** PATCH /v1/vendors/{vendorId}/items/{itemId} */
  @Patch('items/:itemId')
  @Idempotent()
  update(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodBodyPipe(UpdateMenuItemSchema)) body: UpdateMenuItemBody,
  ): Promise<MenuItem> {
    return this.updateItem.execute(p.userId, vendorId, itemId, body);
  }

  /** PUT /v1/vendors/{vendorId}/items/{itemId}/availability */
  @Put('items/:itemId/availability')
  @Idempotent()
  itemAvailability(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodBodyPipe(SetAvailabilitySchema)) body: SetAvailability,
  ): Promise<MenuItem> {
    return this.setItemAvailability.execute(p.userId, vendorId, itemId, body.available);
  }

  /** PUT /v1/vendors/{vendorId}/modifier-options/{optionId}/availability */
  @Put('modifier-options/:optionId/availability')
  @Idempotent()
  optionAvailability(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Param('optionId', uuid) optionId: string,
    @Body(new ZodBodyPipe(SetAvailabilitySchema)) body: SetAvailability,
  ): Promise<ModifierOption> {
    return this.setOptionAvailability.execute(p.userId, vendorId, optionId, body.available);
  }

  /** POST /v1/vendors/{vendorId}/items/{itemId}/modifier-groups */
  @Post('items/:itemId/modifier-groups')
  @HttpCode(201)
  @Idempotent()
  group(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodBodyPipe(CreateModifierGroupSchema)) body: CreateModifierGroupBody,
  ): Promise<ModifierGroup> {
    return this.createGroup.execute(p.userId, vendorId, itemId, body);
  }

  /** PUT /v1/vendors/{vendorId}/branches/{branchId}/opening-hours */
  @Put('branches/:branchId/opening-hours')
  @Idempotent()
  async hours(
    @CurrentPrincipal() p: Principal,
    @Param('vendorId', uuid) vendorId: string,
    @Param('branchId', uuid) branchId: string,
    @Body(new ZodBodyPipe(ReplaceOpeningHoursSchema)) body: ReplaceOpeningHoursBody,
  ): Promise<OpeningHoursResponse> {
    return { hours: await this.replaceHours.execute(p.userId, vendorId, branchId, body.hours) };
  }
}
