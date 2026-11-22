import {
  type Address,
  type AddressList,
  AddressListSchema,
  AddressSchema,
  type CreateAddress,
  type CreateMenuItem,
  type CreateModifierGroup,
  type DiscoverVendorsQuery,
  type DiscoverVendorsResponse,
  DiscoverVendorsResponseSchema,
  type MenuItem,
  MenuItemSchema,
  type ModifierGroup,
  ModifierGroupSchema,
  type ModifierOption,
  ModifierOptionSchema,
  type OpeningHoursResponse,
  OpeningHoursResponseSchema,
  type ReplaceOpeningHours,
  type SetAvailability,
  type UpdateAddress,
  type UpdateMenuItem,
  type VendorDetail,
  VendorDetailSchema,
  type LogoutRequest,
  type OtpRequest,
  type OtpRequestResponse,
  OtpRequestResponseSchema,
  type OtpVerify,
  PROBLEM_CONTENT_TYPE,
  type Problem,
  ProblemSchema,
  type RefreshRequest,
  ROUTES,
  type TokenPair,
  TokenPairSchema,
  type CreateFeeRule,
  type CreatePromo,
  type FeeRule,
  type FeeRuleList,
  type CreateSurgeRule,
  type SurgeRule,
  type SurgeRuleList,
  SurgeRuleListSchema,
  SurgeRuleSchema,
  type UpdateSurgeRule,
  FeeRuleListSchema,
  FeeRuleSchema,
  type Promo,
  type PromoList,
  PromoListSchema,
  PromoSchema,
  type QuoteRequest,
  type QuoteResponse,
  QuoteResponseSchema,
  type UpdateFeeRule,
  type UpdatePromo,
  type DeviceRegistration,
  DeviceRegistrationSchema,
  type ListNotificationsQuery,
  type LocationBatchResult,
  LocationBatchResultSchema,
  type NotificationPage,
  NotificationPageSchema,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  type RegisterDevice,
  type RiderLocationBatch,
  type CreateTopUpRequest,
  type PaymentIntent,
  PaymentIntentSchema,
  type Wallet,
  WalletSchema,
  type WalletTransactionsPage,
  WalletTransactionsPageSchema,
  ADMIN_2FA_HEADER,
  type AdminRiderApplicationList,
  AdminRiderApplicationListSchema,
  type AdminTwoFactorSession,
  AdminTwoFactorSessionSchema,
  type AdminVendorApplicationList,
  AdminVendorApplicationListSchema,
  type BankAccountInput,
  type CreateUpload,
  type DownloadUrl,
  DownloadUrlSchema,
  type FeatureFlag,
  type FeatureFlagList,
  FeatureFlagListSchema,
  FeatureFlagSchema,
  type ListApplicationsQuery,
  type MenuImport,
  type MenuImportResult,
  MenuImportResultSchema,
  type MenuPhotos,
  type Quiz,
  type QuizResult,
  QuizResultSchema,
  QuizSchema,
  type QuizSubmission,
  type ReviewDecision,
  type RiderApplication,
  RiderApplicationSchema,
  type RiderGuarantor,
  type RiderIdentity,
  type RiderPersonalDetails,
  type RiderStep,
  type RiderVehicle,
  type TestOrderChecklist,
  type TotpCode,
  type TotpEnrolment,
  TotpEnrolmentSchema,
  type UploadTicket,
  UploadTicketSchema,
  type UpsertFeatureFlag,
  type VendorApplication,
  VendorApplicationSchema,
  type VendorBusinessDetails,
  type VendorDocuments,
  type VendorLocation,
  type VendorStep,
  type AdminDispatchRiderList,
  AdminDispatchRiderListSchema,
  type ArrivedAtVendor,
  type CurrentTrip,
  CurrentTripSchema,
  type Delivered,
  type DispatchOffer,
  DispatchOfferSchema,
  type ManualAssign,
  type RiderEarnings,
  RiderEarningsSchema,
  type RiderProfile,
  RiderProfileSchema,
  type Trip,
  type TripAction,
  TripSchema,
  type Undeliverable,
} from '@delyva/contracts';

/** Trip action path segments (POST /v1/trips/{id}/<segment>). */
export type TripActionSegment =
  'arrived-at-vendor' | 'picked-up' | 'arrived-at-customer' | 'delivered' | 'undeliverable';

/** Body for each trip action. */
export interface TripActionBodies {
  'arrived-at-vendor': ArrivedAtVendor;
  'picked-up': TripAction;
  'arrived-at-customer': TripAction;
  delivered: Delivered;
  undeliverable: Undeliverable;
}
import type { z } from 'zod';
// Cycle-safe: OrderingClient is only constructed lazily (getter), pathOf only called at runtime.
import { OrderingClient } from './ordering.js';

const withId = (path: string, id: string): string => path.replace('{id}', encodeURIComponent(id));

/** Thrown for any non-2xx response; carries the parsed RFC 9457 problem. */
export class ApiError extends Error {
  /** @param problem parsed problem details */
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

/** Client options. */
export interface DelyvaClientOptions {
  /** API origin, e.g. `https://api.delyva.ng` (from app config, never hardcoded). */
  readonly baseUrl: string;
  /** Injectable fetch (tests, RN polyfills). */
  readonly fetch?: typeof fetch;
  /** Per-request timeout; defaults to 15 s for poor networks. */
  readonly timeoutMs?: number;
  /** Generates idempotency keys for write calls. */
  readonly idempotencyKey?: () => string;
  /** Current access token (from SecureStore); sent as a Bearer token when present. */
  readonly accessToken?: () => string | null | undefined;
  /** Admin 2FA session token (from `verifyAdminTotp`); sent as `x-admin-2fa` on admin calls. */
  readonly adminTwoFactorToken?: () => string | null | undefined;
}

/** Body type of each rider step. */
export interface RiderStepBodies {
  readonly personal_details: RiderPersonalDetails;
  readonly identity: RiderIdentity;
  readonly vehicle: RiderVehicle;
  readonly guarantor: RiderGuarantor;
  readonly bank_account: BankAccountInput;
}

const RIDER_STEP_ROUTE = {
  personal_details: 'saveRiderPersonalDetails',
  identity: 'saveRiderIdentity',
  vehicle: 'saveRiderVehicle',
  guarantor: 'saveRiderGuarantor',
  bank_account: 'saveRiderBankAccount',
} as const satisfies Record<keyof RiderStepBodies, keyof typeof ROUTES>;

/** Body type of each PUT vendor step. */
export interface VendorStepBodies {
  readonly business_details: VendorBusinessDetails;
  readonly documents: VendorDocuments;
  readonly location: VendorLocation;
  readonly menu_photos: MenuPhotos;
  readonly bank_account: BankAccountInput;
  readonly test_order: TestOrderChecklist;
}

const VENDOR_STEP_ROUTE = {
  business_details: 'saveVendorBusinessDetails',
  documents: 'saveVendorDocuments',
  location: 'saveVendorLocation',
  menu_photos: 'saveVendorMenuPhotos',
  bank_account: 'saveVendorBankAccount',
  test_order: 'saveVendorTestOrder',
} as const satisfies Record<keyof VendorStepBodies, keyof typeof ROUTES>;

const fallbackProblem = (status: number): Problem => ({
  type: 'about:blank',
  title: 'Request failed',
  status: status >= 400 && status <= 599 ? status : 500,
  code: 'internal_error',
});

/** Typed client for the Delyva auth endpoints, validated against the shared contracts. */
export class DelyvaClient {
  private readonly fetchImpl: typeof fetch;

  /** @param options client options */
  constructor(private readonly options: DelyvaClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** POST /v1/auth/otp/request */
  requestOtp(body: OtpRequest, idempotencyKey?: string): Promise<OtpRequestResponse> {
    const key = idempotencyKey ?? this.options.idempotencyKey?.() ?? crypto.randomUUID();
    return this.post(ROUTES.requestOtp.path, body, OtpRequestResponseSchema, {
      'Idempotency-Key': key,
    });
  }

  /** POST /v1/auth/otp/verify */
  verifyOtp(body: OtpVerify): Promise<TokenPair> {
    return this.post(ROUTES.verifyOtp.path, body, TokenPairSchema);
  }

  /** POST /v1/auth/refresh */
  refresh(body: RefreshRequest): Promise<TokenPair> {
    return this.post(ROUTES.refresh.path, body, TokenPairSchema);
  }

  /** POST /v1/auth/logout */
  async logout(body: LogoutRequest): Promise<void> {
    await this.post(ROUTES.logout.path, body, null);
  }

  /** POST /v1/quotes — server-computed price breakdown. */
  createQuote(body: QuoteRequest): Promise<QuoteResponse> {
    return this.post(ROUTES.createQuote.path, body, QuoteResponseSchema);
  }

  /** GET /v1/admin/fee-rules */
  listFeeRules(): Promise<FeeRuleList> {
    return this.send('GET', ROUTES.listFeeRules.path, undefined, FeeRuleListSchema);
  }

  /** POST /v1/admin/fee-rules */
  createFeeRule(body: CreateFeeRule, idempotencyKey?: string): Promise<FeeRule> {
    return this.post(ROUTES.createFeeRule.path, body, FeeRuleSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/admin/fee-rules/{id} */
  updateFeeRule(id: string, body: UpdateFeeRule): Promise<FeeRule> {
    return this.send('PATCH', withId(ROUTES.updateFeeRule.path, id), body, FeeRuleSchema);
  }

  /** GET /v1/admin/surge-rules */
  listSurgeRules(): Promise<SurgeRuleList> {
    return this.send('GET', ROUTES.listSurgeRules.path, undefined, SurgeRuleListSchema);
  }

  /** POST /v1/admin/surge-rules */
  createSurgeRule(body: CreateSurgeRule, idempotencyKey?: string): Promise<SurgeRule> {
    return this.post(ROUTES.createSurgeRule.path, body, SurgeRuleSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/admin/surge-rules/{id} */
  updateSurgeRule(id: string, body: UpdateSurgeRule): Promise<SurgeRule> {
    return this.send('PATCH', withId(ROUTES.updateSurgeRule.path, id), body, SurgeRuleSchema);
  }

  /** GET /v1/admin/promos */
  listPromos(): Promise<PromoList> {
    return this.send('GET', ROUTES.listPromos.path, undefined, PromoListSchema);
  }

  /** POST /v1/admin/promos */
  createPromo(body: CreatePromo, idempotencyKey?: string): Promise<Promo> {
    return this.post(ROUTES.createPromo.path, body, PromoSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/admin/promos/{id} */
  updatePromo(id: string, body: UpdatePromo): Promise<Promo> {
    return this.send('PATCH', withId(ROUTES.updatePromo.path, id), body, PromoSchema);
  }

  /** GET /v1/notifications — the caller's inbox. */
  listNotifications(query: ListNotificationsQuery = {}): Promise<NotificationPage> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (typeof v === 'string' || typeof v === 'number') params.set(k, String(v));
    }
    const qs = params.size > 0 ? `?${params.toString()}` : '';
    const path = `${ROUTES.listNotifications.path}${qs}`;
    return this.send('GET', path, undefined, NotificationPageSchema);
  }

  /** POST /v1/notifications/{id}/read */
  async markNotificationRead(id: string): Promise<void> {
    await this.send('POST', withId(ROUTES.markNotificationRead.path, id), undefined, null);
  }

  /** GET /v1/notifications/preferences */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    const path = ROUTES.getNotificationPreferences.path;
    return this.send('GET', path, undefined, NotificationPreferencesSchema);
  }

  /** PUT /v1/notifications/preferences */
  updateNotificationPreferences(body: NotificationPreferences): Promise<NotificationPreferences> {
    const path = ROUTES.updateNotificationPreferences.path;
    return this.send('PUT', path, body, NotificationPreferencesSchema);
  }

  /** POST /v1/devices — binds the Expo push token to the token's device. */
  registerDevice(body: RegisterDevice): Promise<DeviceRegistration> {
    return this.send('POST', ROUTES.registerDevice.path, body, DeviceRegistrationSchema);
  }

  /** POST /v1/riders/me/locations — HTTP fallback when the socket is down. */
  postRiderLocations(body: RiderLocationBatch): Promise<LocationBatchResult> {
    return this.send('POST', ROUTES.postRiderLocations.path, body, LocationBatchResultSchema);
  }

  /** GET /v1/wallet (bearer) */
  getWallet(): Promise<Wallet> {
    return this.send('GET', ROUTES.getWallet.path, undefined, WalletSchema);
  }

  /** GET /v1/wallet/transactions (bearer) */
  listWalletTransactions(
    q: { limit?: number; cursor?: string } = {},
  ): Promise<WalletTransactionsPage> {
    const qs = new URLSearchParams();
    if (q.limit !== undefined) qs.set('limit', String(q.limit));
    if (q.cursor !== undefined) qs.set('cursor', q.cursor);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    const path = `${ROUTES.listWalletTransactions.path}${suffix}`;
    return this.send('GET', path, undefined, WalletTransactionsPageSchema);
  }

  /** POST /v1/wallet/top-ups (bearer; stable idempotency key per user intent) */
  createWalletTopUp(body: CreateTopUpRequest, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.post(
      ROUTES.createWalletTopUp.path,
      body,
      PaymentIntentSchema,
      this.idem(idempotencyKey),
    );
  }

  /** GET /v1/payment-intents/{id} (bearer) */
  getPaymentIntent(id: string): Promise<PaymentIntent> {
    return this.send(
      'GET',
      withId(ROUTES.getPaymentIntent.path, id),
      undefined,
      PaymentIntentSchema,
    );
  }

  /** POST /v1/payment-intents/{id}/verify (bearer) — server-side verify after checkout redirect */
  verifyPaymentIntent(id: string, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.post(
      withId(ROUTES.verifyPaymentIntent.path, id),
      undefined,
      PaymentIntentSchema,
      this.idem(idempotencyKey),
    );
  }

  /**
   * Generic validated request (used by sub-clients such as {@link OrderingClient}). A non-undefined
   * `idempotencyKey` argument (string, or null to auto-generate) adds the Idempotency-Key header.
   */
  request<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    schema: S | null,
    idempotencyKey?: string | null,
  ): Promise<z.infer<S>> {
    const headers = idempotencyKey === undefined ? {} : this.idem(idempotencyKey ?? undefined);
    return this.send(method, path, body, schema, headers);
  }

  /** Carts, checkout, orders, vendor and ops order actions. */
  get ordering(): OrderingClient {
    return new OrderingClient(this);
  }

  // ------------------------------------------------------------ uploads & onboarding (ADR 0700)

  /** POST /v1/uploads — then PUT the bytes to `ticket.url` with `ticket.headers`. */
  createUpload(body: CreateUpload, idempotencyKey?: string): Promise<UploadTicket> {
    return this.post(ROUTES.createUpload.path, body, UploadTicketSchema, this.idem(idempotencyKey));
  }

  /** GET /v1/rider-applications/me */
  getMyRiderApplication(): Promise<RiderApplication> {
    return this.send('GET', ROUTES.getMyRiderApplication.path, undefined, RiderApplicationSchema);
  }

  /** POST /v1/rider-applications/me/step-views (funnel analytics) */
  async recordRiderStepView(step: RiderStep): Promise<void> {
    await this.send('POST', ROUTES.recordRiderStepView.path, { step }, null);
  }

  /** PUT a rider step. */
  saveRiderStep<K extends keyof RiderStepBodies>(
    step: K,
    body: RiderStepBodies[K],
  ): Promise<RiderApplication> {
    return this.send('PUT', ROUTES[RIDER_STEP_ROUTE[step]].path, body, RiderApplicationSchema);
  }

  /** GET /v1/rider-applications/me/quiz */
  getRiderQuiz(): Promise<Quiz> {
    return this.send('GET', ROUTES.getRiderQuiz.path, undefined, QuizSchema);
  }

  /** POST /v1/rider-applications/me/quiz */
  submitRiderQuiz(body: QuizSubmission, idempotencyKey?: string): Promise<QuizResult> {
    return this.post(
      ROUTES.submitRiderQuiz.path,
      body,
      QuizResultSchema,
      this.idem(idempotencyKey),
    );
  }

  /** POST /v1/rider-applications/me/submit */
  submitRiderApplication(idempotencyKey?: string): Promise<RiderApplication> {
    return this.post(
      ROUTES.submitRiderApplication.path,
      undefined,
      RiderApplicationSchema,
      this.idem(idempotencyKey),
    );
  }

  /** GET /v1/vendor-applications/me */
  getMyVendorApplication(): Promise<VendorApplication> {
    return this.send('GET', ROUTES.getMyVendorApplication.path, undefined, VendorApplicationSchema);
  }

  /** POST /v1/vendor-applications/me/step-views */
  async recordVendorStepView(step: VendorStep): Promise<void> {
    await this.send('POST', ROUTES.recordVendorStepView.path, { step }, null);
  }

  /** PUT a vendor step. */
  saveVendorStep<K extends keyof VendorStepBodies>(
    step: K,
    body: VendorStepBodies[K],
  ): Promise<VendorApplication> {
    return this.send('PUT', ROUTES[VENDOR_STEP_ROUTE[step]].path, body, VendorApplicationSchema);
  }

  /** POST /v1/vendor-applications/me/menu-import */
  importVendorMenu(body: MenuImport, idempotencyKey?: string): Promise<MenuImportResult> {
    return this.post(
      ROUTES.importVendorMenu.path,
      body,
      MenuImportResultSchema,
      this.idem(idempotencyKey),
    );
  }

  /** POST /v1/vendor-applications/me/submit */
  submitVendorApplication(idempotencyKey?: string): Promise<VendorApplication> {
    return this.post(
      ROUTES.submitVendorApplication.path,
      undefined,
      VendorApplicationSchema,
      this.idem(idempotencyKey),
    );
  }

  // ------------------------------------------------------------ admin (send the 2FA token via `adminTwoFactorToken`)

  /** POST /v1/admin/2fa/enrolment */
  startAdminTotpEnrolment(idempotencyKey?: string): Promise<TotpEnrolment> {
    return this.post(
      ROUTES.startAdminTotpEnrolment.path,
      undefined,
      TotpEnrolmentSchema,
      this.idem(idempotencyKey),
    );
  }

  /** POST /v1/admin/2fa/enrolment/confirm */
  confirmAdminTotpEnrolment(body: TotpCode): Promise<AdminTwoFactorSession> {
    return this.post(ROUTES.confirmAdminTotpEnrolment.path, body, AdminTwoFactorSessionSchema);
  }

  /** POST /v1/admin/2fa/verify */
  verifyAdminTotp(body: TotpCode): Promise<AdminTwoFactorSession> {
    return this.post(ROUTES.verifyAdminTotp.path, body, AdminTwoFactorSessionSchema);
  }

  /** GET /v1/admin/rider-applications */
  listRiderApplications(
    status: ListApplicationsQuery['status'] = 'pending_review',
  ): Promise<AdminRiderApplicationList> {
    const path = `${ROUTES.listRiderApplications.path}?status=${status}`;
    return this.send('GET', path, undefined, AdminRiderApplicationListSchema, this.admin());
  }

  /** POST /v1/admin/rider-applications/{id}/approve|reject */
  decideRiderApplication(
    id: string,
    decision: 'approve' | 'reject',
    body: ReviewDecision,
    idempotencyKey?: string,
  ): Promise<RiderApplication> {
    const route =
      decision === 'approve' ? ROUTES.approveRiderApplication : ROUTES.rejectRiderApplication;
    return this.post(withId(route.path, id), body, RiderApplicationSchema, {
      ...this.admin(),
      ...this.idem(idempotencyKey),
    });
  }

  /** GET /v1/admin/vendor-applications */
  listVendorApplications(
    status: ListApplicationsQuery['status'] = 'pending_review',
  ): Promise<AdminVendorApplicationList> {
    const path = `${ROUTES.listVendorApplications.path}?status=${status}`;
    return this.send('GET', path, undefined, AdminVendorApplicationListSchema, this.admin());
  }

  /** POST /v1/admin/vendor-applications/{id}/approve|reject */
  decideVendorApplication(
    id: string,
    decision: 'approve' | 'reject',
    body: ReviewDecision,
    idempotencyKey?: string,
  ): Promise<VendorApplication> {
    const route =
      decision === 'approve' ? ROUTES.approveVendorApplication : ROUTES.rejectVendorApplication;
    return this.post(withId(route.path, id), body, VendorApplicationSchema, {
      ...this.admin(),
      ...this.idem(idempotencyKey),
    });
  }

  /** GET /v1/admin/uploads/{id}/download-url */
  getUploadDownloadUrl(id: string): Promise<DownloadUrl> {
    return this.send(
      'GET',
      withId(ROUTES.getUploadDownloadUrl.path, id),
      undefined,
      DownloadUrlSchema,
      this.admin(),
    );
  }

  /** GET /v1/admin/feature-flags */
  listFeatureFlags(): Promise<FeatureFlagList> {
    return this.send(
      'GET',
      ROUTES.listFeatureFlags.path,
      undefined,
      FeatureFlagListSchema,
      this.admin(),
    );
  }

  /** PUT /v1/admin/feature-flags */
  upsertFeatureFlag(body: UpsertFeatureFlag): Promise<FeatureFlag> {
    return this.send('PUT', ROUTES.upsertFeatureFlag.path, body, FeatureFlagSchema, this.admin());
  }

  private admin(): Record<string, string> {
    const token = this.options.adminTwoFactorToken?.();
    return token ? { [ADMIN_2FA_HEADER]: token } : {};
  }

  /** GET /v1/riders/me (rider) */
  getMyRiderProfile(): Promise<RiderProfile> {
    return this.send('GET', ROUTES.getMyRiderProfile.path, undefined, RiderProfileSchema);
  }

  /** POST /v1/riders/me/online (rider) */
  goOnline(batteryPct: number, idempotencyKey?: string): Promise<RiderProfile> {
    const path = ROUTES.goOnline.path;
    return this.post(path, { batteryPct }, RiderProfileSchema, this.idem(idempotencyKey));
  }

  /** POST /v1/riders/me/offline (rider) */
  goOffline(batteryPct: number, idempotencyKey?: string): Promise<RiderProfile> {
    const path = ROUTES.goOffline.path;
    return this.post(path, { batteryPct }, RiderProfileSchema, this.idem(idempotencyKey));
  }

  /** GET /v1/riders/me/trips/current (rider) */
  getMyCurrentTrip(): Promise<CurrentTrip> {
    return this.send('GET', ROUTES.getMyCurrentTrip.path, undefined, CurrentTripSchema);
  }

  /** GET /v1/riders/me/earnings (rider) */
  getMyRiderEarnings(): Promise<RiderEarnings> {
    return this.send('GET', ROUTES.getMyRiderEarnings.path, undefined, RiderEarningsSchema);
  }

  /** POST /v1/dispatch-offers/{id}/accept (rider) */
  acceptDispatchOffer(id: string, idempotencyKey?: string): Promise<Trip> {
    const path = withId(ROUTES.acceptDispatchOffer.path, id);
    return this.post(path, undefined, TripSchema, this.idem(idempotencyKey));
  }

  /** POST /v1/dispatch-offers/{id}/decline (rider) */
  declineDispatchOffer(id: string, idempotencyKey?: string): Promise<DispatchOffer> {
    const path = withId(ROUTES.declineDispatchOffer.path, id);
    return this.post(path, undefined, DispatchOfferSchema, this.idem(idempotencyKey));
  }

  /**
   * POST /v1/trips/{id}/<action> (rider). Queue offline with a stable `idempotencyKey` and
   * the device `location` captured at the time; replay when back online.
   */
  tripAction<S extends TripActionSegment>(
    tripId: string,
    action: S,
    body: TripActionBodies[S],
    idempotencyKey?: string,
  ): Promise<Trip> {
    const path = `/v1/trips/${encodeURIComponent(tripId)}/${action}`;
    return this.post(path, body, TripSchema, this.idem(idempotencyKey));
  }

  /** GET /v1/admin/dispatch/riders (ops) */
  listDispatchRiders(): Promise<AdminDispatchRiderList> {
    const path = ROUTES.listDispatchRiders.path;
    return this.send('GET', path, undefined, AdminDispatchRiderListSchema);
  }

  /** POST /v1/admin/dispatch/orders/{orderId}/assign (ops; reason required) */
  manuallyAssignOrder(orderId: string, body: ManualAssign, idempotencyKey?: string): Promise<Trip> {
    const path = pathOf(ROUTES.manuallyAssignOrder.path, { orderId });
    return this.post(path, body, TripSchema, this.idem(idempotencyKey));
  }

  private idem(key?: string): Record<string, string> {
    return { 'Idempotency-Key': key ?? this.options.idempotencyKey?.() ?? crypto.randomUUID() };
  }

  private post<S extends z.ZodType>(
    path: string,
    body: unknown,
    schema: S | null,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    return this.send('POST', path, body, schema, headers);
  }

  private async send<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    schema: S | null,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const token = this.options.accessToken?.();
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (!response.ok) throw new ApiError(await parseProblem(response));
    if (schema === null) return undefined as z.infer<S>;
    return schema.parse(await response.json());
  }

  /** GET /v1/vendors — open vendors that deliver to the point. */
  discoverVendors(query: DiscoverVendorsQuery): Promise<DiscoverVendorsResponse> {
    const qs = new URLSearchParams({ lat: String(query.lat), lng: String(query.lng) });
    if (query.category) qs.set('category', query.category);
    const path = `${ROUTES.discoverVendors.path}?${qs.toString()}`;
    return this.send('GET', path, undefined, DiscoverVendorsResponseSchema);
  }

  /** GET /v1/vendors/{vendorId} */
  getVendor(vendorId: string): Promise<VendorDetail> {
    const path = pathOf(ROUTES.getVendor.path, { vendorId });
    return this.send('GET', path, undefined, VendorDetailSchema);
  }

  /** GET /v1/addresses (auth) */
  listAddresses(): Promise<AddressList> {
    return this.send('GET', ROUTES.listAddresses.path, undefined, AddressListSchema);
  }

  /** POST /v1/addresses (auth, idempotent) */
  createAddress(body: CreateAddress, idempotencyKey?: string): Promise<Address> {
    return this.send(
      'POST',
      ROUTES.createAddress.path,
      body,
      AddressSchema,
      this.idem(idempotencyKey),
    );
  }

  /** PATCH /v1/addresses/{addressId} (auth, idempotent) */
  updateAddress(addressId: string, body: UpdateAddress, idempotencyKey?: string): Promise<Address> {
    const path = pathOf(ROUTES.updateAddress.path, { addressId });
    return this.send('PATCH', path, body, AddressSchema, this.idem(idempotencyKey));
  }

  /** DELETE /v1/addresses/{addressId} (auth, idempotent) */
  async deleteAddress(addressId: string, idempotencyKey?: string): Promise<void> {
    const path = pathOf(ROUTES.deleteAddress.path, { addressId });
    await this.send('DELETE', path, undefined, null, this.idem(idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/items (vendor owner) */
  createMenuItem(
    vendorId: string,
    body: CreateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.createMenuItem.path, { vendorId });
    return this.send('POST', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/vendors/{vendorId}/items/{itemId} (vendor owner) */
  updateMenuItem(
    vendorId: string,
    itemId: string,
    body: UpdateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.updateMenuItem.path, { vendorId, itemId });
    return this.send('PATCH', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PUT …/items/{itemId}/availability (vendor owner or staff) */
  setItemAvailability(
    vendorId: string,
    itemId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.setItemAvailability.path, { vendorId, itemId });
    return this.send('PUT', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PUT …/modifier-options/{optionId}/availability (vendor owner or staff) */
  setModifierOptionAvailability(
    vendorId: string,
    optionId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<ModifierOption> {
    const path = pathOf(ROUTES.setModifierOptionAvailability.path, { vendorId, optionId });
    return this.send('PUT', path, body, ModifierOptionSchema, this.idem(idempotencyKey));
  }

  /** POST …/items/{itemId}/modifier-groups (vendor owner) */
  createModifierGroup(
    vendorId: string,
    itemId: string,
    body: CreateModifierGroup,
    idempotencyKey?: string,
  ): Promise<ModifierGroup> {
    const path = pathOf(ROUTES.createModifierGroup.path, { vendorId, itemId });
    return this.send('POST', path, body, ModifierGroupSchema, this.idem(idempotencyKey));
  }

  /** PUT …/branches/{branchId}/opening-hours (vendor owner) */
  replaceOpeningHours(
    vendorId: string,
    branchId: string,
    body: ReplaceOpeningHours,
    idempotencyKey?: string,
  ): Promise<OpeningHoursResponse> {
    const path = pathOf(ROUTES.replaceOpeningHours.path, { vendorId, branchId });
    return this.send('PUT', path, body, OpeningHoursResponseSchema, this.idem(idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/go-live (ops) */
  approveVendor(vendorId: string, idempotencyKey?: string): Promise<VendorDetail> {
    const path = pathOf(ROUTES.approveVendor.path, { vendorId });
    return this.send('POST', path, undefined, VendorDetailSchema, this.idem(idempotencyKey));
  }
}

/** Fills `{name}` path segments, URL-encoding each value. */
export function pathOf(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path param ${name}`);
    return encodeURIComponent(value);
  });
}

/** Parses an RFC 9457 problem body, falling back to a generic problem. */
export async function parseProblem(response: Response): Promise<Problem> {
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallbackProblem(response.status);
  } catch {
    return fallbackProblem(response.status);
  }
}
