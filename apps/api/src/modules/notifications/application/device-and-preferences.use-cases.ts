import type {
  DeviceRegistration,
  NotificationLocale,
  NotificationPreference,
  NotificationPreferences,
} from '@delyva/contracts';
import { effectivePreferences } from '../domain/preferences.js';
import type { Clock, DeviceRepository, PreferenceRepository } from './ports.js';

/** Command: bind an Expo push token to (user, device-from-token). Upsert, so retries are safe. */
export class RegisterDevice {
  /** @param devices device repository @param clock clock */
  constructor(
    private readonly devices: DeviceRepository,
    private readonly clock: Clock,
  ) {}

  /** Executes the command. `deviceId` must come from the verified access token. */
  async execute(input: {
    userId: string;
    deviceId: string;
    pushToken: string;
    platform: 'ios' | 'android';
    locale: NotificationLocale;
  }): Promise<DeviceRegistration> {
    const now = this.clock.now();
    await this.devices.upsert({ ...input, updatedAt: now });
    return {
      deviceId: input.deviceId,
      platform: input.platform,
      locale: input.locale,
      registeredAt: now.toISOString(),
    };
  }
}

/** Query: effective preferences (defaults merged with the user's overrides). */
export class GetPreferences {
  /** @param prefs preference repository */
  constructor(private readonly prefs: PreferenceRepository) {}

  /** Executes the query. */
  async execute(userId: string): Promise<NotificationPreferences> {
    return { preferences: effectivePreferences(await this.prefs.get(userId)) };
  }
}

/** Command: upsert preference overrides, returning the effective matrix. */
export class UpdatePreferences {
  /** @param prefs preference repository */
  constructor(private readonly prefs: PreferenceRepository) {}

  /** Executes the command (last write per category/channel wins). */
  async execute(
    userId: string,
    updates: readonly NotificationPreference[],
  ): Promise<NotificationPreferences> {
    const deduped = [...new Map(updates.map((p) => [`${p.category}:${p.channel}`, p])).values()];
    await this.prefs.put(userId, deduped);
    return { preferences: effectivePreferences(await this.prefs.get(userId)) };
  }
}
