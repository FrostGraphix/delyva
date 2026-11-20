import {
  type DeviceRegistration,
  DeviceRegistrationSchema,
  type ListNotificationsQuery,
  type LocationBatchResult,
  LocationBatchResultSchema,
  type NotificationPage,
  NotificationPageSchema,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  PROBLEM_CONTENT_TYPE,
  type RegisterDevice,
  type RiderLocationBatch,
  ROUTES,
} from '@delyva/contracts';
import type { z } from 'zod';
import { ApiError, type DelyvaClientOptions, parseProblem } from './client.js';

/** Options for authenticated clients. */
export interface AuthedClientOptions extends DelyvaClientOptions {
  /** Returns the current access token (read from SecureStore by the app). */
  readonly accessToken: () => string | null | Promise<string | null>;
}

/** Typed client for notifications, devices and the rider location fallback (bearer auth). */
export class NotificationsClient {
  private readonly fetchImpl: typeof fetch;

  /** @param options client options incl. access-token provider */
  constructor(private readonly options: AuthedClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** GET /v1/notifications */
  listNotifications(query: ListNotificationsQuery = {}): Promise<NotificationPage> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
    const qs = params.size > 0 ? `?${params.toString()}` : '';
    return this.call(
      'GET',
      `${ROUTES.listNotifications.path}${qs}`,
      undefined,
      NotificationPageSchema,
    );
  }

  /** POST /v1/notifications/{id}/read */
  async markNotificationRead(id: string): Promise<void> {
    const path = ROUTES.markNotificationRead.path.replace('{id}', encodeURIComponent(id));
    await this.call('POST', path, undefined, null);
  }

  /** GET /v1/notifications/preferences */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.call(
      'GET',
      ROUTES.getNotificationPreferences.path,
      undefined,
      NotificationPreferencesSchema,
    );
  }

  /** PUT /v1/notifications/preferences */
  updateNotificationPreferences(body: NotificationPreferences): Promise<NotificationPreferences> {
    return this.call(
      'PUT',
      ROUTES.updateNotificationPreferences.path,
      body,
      NotificationPreferencesSchema,
    );
  }

  /** POST /v1/devices */
  registerDevice(body: RegisterDevice): Promise<DeviceRegistration> {
    return this.call('POST', ROUTES.registerDevice.path, body, DeviceRegistrationSchema);
  }

  /** POST /v1/riders/me/locations (use when the socket is down). */
  postRiderLocations(body: RiderLocationBatch): Promise<LocationBatchResult> {
    return this.call('POST', ROUTES.postRiderLocations.path, body, LocationBatchResultSchema);
  }

  private async call<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    schema: S | null,
  ): Promise<z.infer<S>> {
    const token = await this.options.accessToken();
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (!response.ok) throw new ApiError(await parseProblem(response));
    if (schema === null) return undefined as z.infer<S>;
    return schema.parse(await response.json());
  }
}
