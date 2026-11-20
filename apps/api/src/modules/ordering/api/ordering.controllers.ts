import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AcceptOrder,
  AcceptOrderSchema,
  type AddCartLine,
  AddCartLineSchema,
  type AdminCancelOrder,
  AdminCancelOrderSchema,
  type CancelOrder,
  CancelOrderSchema,
  type Cart,
  type CartList,
  type CheckoutRequest,
  CheckoutRequestSchema,
  type ListAdminOrdersQuery,
  ListAdminOrdersQuerySchema,
  type ListMyOrdersQuery,
  ListMyOrdersQuerySchema,
  type ListVendorOrdersQuery,
  ListVendorOrdersQuerySchema,
  type Order,
  type OrderPage,
  type RejectOrder,
  RejectOrderSchema,
  type UpdateCartLine,
  UpdateCartLineSchema,
} from '@delyva/contracts';
import { AuthGuard, type AuthPrincipal, Principal, Roles } from '../../../shared/auth/auth.guard.js';
import { OwnershipGuard, OwnsResource } from '../../../shared/auth/ownership.guard.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { ZodQueryPipe } from '../../../shared/validation/zod-query.pipe.js';
import {
  AddCartLineUseCase,
  DeleteCartUseCase,
  GetCart,
  ListCarts,
  RemoveCartLineUseCase,
  UpdateCartLineUseCase,
} from '../application/cart.use-cases.js';
import { Checkout } from '../application/checkout.use-case.js';
import {
  CancelOrderByCustomer,
  CancelOrderByOps,
  VendorOrderActions,
} from '../application/order-commands.use-cases.js';
import { OrderQueries } from '../application/order-queries.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new AppError('not_found', 'Not found.') });

/** Customer carts (server-side, re-priced from the catalog on every read). */
@Controller('v1/carts')
@UseGuards(AuthGuard)
export class CartsController {
  /** Injected use cases. */
  constructor(
    private readonly list: ListCarts,
    private readonly get: GetCart,
    private readonly add: AddCartLineUseCase,
    private readonly update: UpdateCartLineUseCase,
    private readonly remove: RemoveCartLineUseCase,
    private readonly del: DeleteCartUseCase,
  ) {}

  /** GET /v1/carts */
  @Get()
  async all(@Principal() p: AuthPrincipal): Promise<CartList> {
    return { items: await this.list.execute(p.userId) };
  }

  /** GET /v1/carts/{cartId} */
  @Get(':cartId')
  one(@Principal() p: AuthPrincipal, @Param('cartId', uuid) cartId: string): Promise<Cart> {
    return this.get.execute(p.userId, cartId);
  }

  /** POST /v1/carts/lines */
  @Post('lines')
  @HttpCode(200)
  @Idempotent()
  addLine(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(AddCartLineSchema)) body: AddCartLine,
  ): Promise<Cart> {
    return this.add.execute(p.userId, body);
  }

  /** PATCH /v1/carts/{cartId}/lines/{lineId} */
  @Patch(':cartId/lines/:lineId')
  @Idempotent()
  updateLine(
    @Principal() p: AuthPrincipal,
    @Param('cartId', uuid) cartId: string,
    @Param('lineId', uuid) lineId: string,
    @Body(new ZodBodyPipe(UpdateCartLineSchema)) body: UpdateCartLine,
  ): Promise<Cart> {
    return this.update.execute(p.userId, cartId, lineId, body);
  }

  /** DELETE /v1/carts/{cartId}/lines/{lineId} */
  @Delete(':cartId/lines/:lineId')
  @Idempotent()
  removeLine(
    @Principal() p: AuthPrincipal,
    @Param('cartId', uuid) cartId: string,
    @Param('lineId', uuid) lineId: string,
  ): Promise<Cart> {
    return this.remove.execute(p.userId, cartId, lineId);
  }

  /** DELETE /v1/carts/{cartId} */
  @Delete(':cartId')
  @HttpCode(204)
  @Idempotent()
  async deleteCart(@Principal() p: AuthPrincipal, @Param('cartId', uuid) cartId: string): Promise<void> {
    await this.del.execute(p.userId, cartId);
  }
}

/** Customer orders: checkout, history, detail, cancel, reorder. */
@Controller('v1/orders')
@UseGuards(AuthGuard)
export class OrdersController {
  /** Injected use cases. */
  constructor(
    private readonly checkout: Checkout,
    private readonly queries: OrderQueries,
    private readonly cancel: CancelOrderByCustomer,
  ) {}

  /** POST /v1/orders (Idempotency-Key required) */
  @Post()
  @HttpCode(201)
  @Idempotent()
  create(
    @Principal() p: AuthPrincipal,
    @Headers('idempotency-key') key: string,
    @Body(new ZodBodyPipe(CheckoutRequestSchema)) body: CheckoutRequest,
  ): Promise<Order> {
    return this.checkout.execute(p.userId, body, key);
  }

  /** GET /v1/orders */
  @Get()
  mine(
    @Principal() p: AuthPrincipal,
    @Query(new ZodQueryPipe(ListMyOrdersQuerySchema)) q: ListMyOrdersQuery,
  ): Promise<OrderPage> {
    return this.queries.mine(p.userId, { limit: Number(q.limit ?? 20), cursor: q.cursor });
  }

  /** GET /v1/orders/{id} */
  @Get(':id')
  one(@Principal() p: AuthPrincipal, @Param('id', uuid) id: string): Promise<Order> {
    return this.queries.mineById(p.userId, id);
  }

  /** POST /v1/orders/{id}/cancel */
  @Post(':id/cancel')
  @HttpCode(200)
  @Idempotent()
  cancelOrder(
    @Principal() p: AuthPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(CancelOrderSchema)) body: CancelOrder,
  ): Promise<Order> {
    return this.cancel.execute(p.userId, id, body.reason);
  }

  /** POST /v1/orders/{id}/reorder */
  @Post(':id/reorder')
  @HttpCode(200)
  @Idempotent()
  reorder(@Principal() p: AuthPrincipal, @Param('id', uuid) id: string): Promise<Cart> {
    return this.queries.reorder(p.userId, id);
  }
}

/** Vendor order list (membership guard on `{vendorId}`). */
@Controller('v1/vendors/:vendorId/orders')
@UseGuards(AuthGuard, OwnershipGuard)
@Roles('vendor_owner', 'vendor_staff')
@OwnsResource('vendorId')
export class VendorOrdersListController {
  /** @param queries order queries */
  constructor(private readonly queries: OrderQueries) {}

  /** GET /v1/vendors/{vendorId}/orders?status= */
  @Get()
  list(
    @Principal() p: AuthPrincipal,
    @Param('vendorId', uuid) vendorId: string,
    @Query(new ZodQueryPipe(ListVendorOrdersQuerySchema)) q: ListVendorOrdersQuery,
  ): Promise<OrderPage> {
    return this.queries.forVendor(p.userId, vendorId, {
      status: q.status,
      limit: Number(q.limit ?? 20),
      cursor: q.cursor,
    });
  }
}

/** Vendor order actions; the use cases check membership of the order's vendor (404 otherwise). */
@Controller('v1/vendor-orders/:id')
@UseGuards(AuthGuard)
@Roles('vendor_owner', 'vendor_staff')
export class VendorOrderActionsController {
  /** @param actions vendor actions */
  constructor(private readonly actions: VendorOrderActions) {}

  /** POST …/accept */
  @Post('accept')
  @HttpCode(200)
  @Idempotent()
  accept(
    @Principal() p: AuthPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(AcceptOrderSchema)) body: AcceptOrder,
  ): Promise<Order> {
    return this.actions.accept(p.userId, id, body);
  }

  /** POST …/reject */
  @Post('reject')
  @HttpCode(200)
  @Idempotent()
  reject(
    @Principal() p: AuthPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(RejectOrderSchema)) body: RejectOrder,
  ): Promise<Order> {
    return this.actions.reject(p.userId, id, body.reason);
  }

  /** POST …/preparing */
  @Post('preparing')
  @HttpCode(200)
  @Idempotent()
  preparing(@Principal() p: AuthPrincipal, @Param('id', uuid) id: string): Promise<Order> {
    return this.actions.preparing(p.userId, id);
  }

  /** POST …/ready */
  @Post('ready')
  @HttpCode(200)
  @Idempotent()
  ready(@Principal() p: AuthPrincipal, @Param('id', uuid) id: string): Promise<Order> {
    return this.actions.ready(p.userId, id);
  }
}

/** Ops order tooling. */
@Controller('v1/admin/orders')
@UseGuards(AuthGuard)
export class AdminOrdersController {
  /** Injected use cases. */
  constructor(
    private readonly queries: OrderQueries,
    private readonly cancel: CancelOrderByOps,
  ) {}

  /** GET /v1/admin/orders */
  @Get()
  @Roles('ops', 'support', 'super_admin')
  list(@Query(new ZodQueryPipe(ListAdminOrdersQuerySchema)) q: ListAdminOrdersQuery): Promise<OrderPage> {
    return this.queries.admin(q);
  }

  /** POST /v1/admin/orders/{id}/cancel (reason required; audited via the outbox event) */
  @Post(':id/cancel')
  @HttpCode(200)
  @Idempotent()
  @Roles('ops', 'super_admin')
  cancelOrder(
    @Principal() p: AuthPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(AdminCancelOrderSchema)) body: AdminCancelOrder,
  ): Promise<Order> {
    return this.cancel.execute(p.userId, id, body.reason);
  }
}
