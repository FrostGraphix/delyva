import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type Address,
  type AddressList,
  type CreateAddress as CreateAddressBody,
  CreateAddressSchema,
  type UpdateAddress as UpdateAddressBody,
  UpdateAddressSchema,
} from '@delyva/contracts';
import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import { AuthGuard, CurrentPrincipal, Roles } from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { CreateAddress } from '../application/create-address.use-case.js';
import { DeleteAddress } from '../application/delete-address.use-case.js';
import { ListAddresses } from '../application/list-addresses.query.js';
import { UpdateAddress } from '../application/update-address.use-case.js';

/** Customer address book (v1). Ownership is the caller's own user id; foreign ids are 404. */
@Controller('v1/addresses')
@UseGuards(AuthGuard)
@Roles('customer')
export class AddressesController {
  /** Injected use cases. */
  constructor(
    private readonly listAddresses: ListAddresses,
    private readonly createAddress: CreateAddress,
    private readonly updateAddress: UpdateAddress,
    private readonly deleteAddress: DeleteAddress,
  ) {}

  /** GET /v1/addresses */
  @Get()
  async list(@CurrentPrincipal() p: Principal): Promise<AddressList> {
    return { items: await this.listAddresses.execute(p.userId) };
  }

  /** POST /v1/addresses — requires Idempotency-Key. */
  @Post()
  @HttpCode(201)
  @Idempotent()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodBodyPipe(CreateAddressSchema)) body: CreateAddressBody,
  ): Promise<Address> {
    return this.createAddress.execute(p.userId, body);
  }

  /** PATCH /v1/addresses/{addressId} — requires Idempotency-Key. */
  @Patch(':addressId')
  @Idempotent()
  update(
    @CurrentPrincipal() p: Principal,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body(new ZodBodyPipe(UpdateAddressSchema)) body: UpdateAddressBody,
  ): Promise<Address> {
    return this.updateAddress.execute(p.userId, addressId, body);
  }

  /** DELETE /v1/addresses/{addressId} — requires Idempotency-Key. */
  @Delete(':addressId')
  @HttpCode(204)
  @Idempotent()
  async remove(
    @CurrentPrincipal() p: Principal,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<void> {
    await this.deleteAddress.execute(p.userId, addressId);
  }
}
