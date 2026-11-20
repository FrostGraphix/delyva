import type { NotificationChannel, NotificationJob } from '@delyva/contracts';
import type { NotifyCommand } from '../domain/event-mappings.js';
import { selectChannels } from '../domain/preferences.js';
import { type RenderedNotification, renderTemplate, TEMPLATES } from '../domain/templates.js';
import type {
  Clock,
  DeliveryQueue,
  DeviceRepository,
  InboxRepository,
  PreferenceRepository,
  RecipientDirectory,
} from './ports.js';

/** Dependencies of {@link NotifyUser}. */
export interface NotifyUserDeps {
  readonly inbox: InboxRepository;
  readonly devices: DeviceRepository;
  readonly preferences: PreferenceRepository;
  readonly directory: RecipientDirectory;
  readonly queue: DeliveryQueue;
  readonly clock: Clock;
}

/** Outcome of a notify command. */
export interface NotifyResult {
  /** Channels a delivery was written or enqueued for. */
  readonly channels: NotificationChannel[];
  /** True when the (event, user) pair was already processed. */
  readonly duplicate: boolean;
}

/** BullMQ job id: deterministic per (event, user, channel); BullMQ forbids `:` in custom ids. */
export const deliveryJobId = (cmd: NotifyCommand, channel: NotificationChannel): string =>
  `${cmd.sourceEventId}_${cmd.userId}_${channel}`;

/**
 * Command: render a template in the user's locale, honour preferences, write the inbox item and
 * enqueue external deliveries. Idempotent per (sourceEventId, userId).
 */
export class NotifyUser {
  /** @param deps ports */
  constructor(private readonly deps: NotifyUserDeps) {}

  /** Executes the command. */
  async execute(cmd: NotifyCommand): Promise<NotifyResult> {
    const { preferences, devices } = this.deps;
    const channels = selectChannels(TEMPLATES[cmd.template], await preferences.get(cmd.userId));
    const userDevices = await devices.activeFor(cmd.userId);
    const rendered = renderTemplate(cmd.template, userDevices[0]?.locale ?? 'en', cmd.params);
    const notificationId = this.deps.clock.uuid();
    let duplicate = false;
    if (channels.includes('in_app')) {
      // On a duplicate we still (re-)enqueue: deterministic job ids make that a no-op when the
      // first attempt got that far, and recover the deliveries when it crashed before enqueueing.
      duplicate = !(await this.deps.inbox.insert({
        id: notificationId,
        userId: cmd.userId,
        template: cmd.template,
        title: rendered.title,
        body: rendered.body,
        data: cmd.data,
        dedupeKey: cmd.sourceEventId,
        createdAt: this.deps.clock.now(),
      }));
    }
    const delivered: NotificationChannel[] = channels.includes('in_app') ? ['in_app'] : [];
    for (const channel of channels.filter((c) => c !== 'in_app')) {
      const job = await this.buildJob(channel, cmd, rendered, notificationId, userDevices);
      if (!job) continue;
      await this.deps.queue.enqueue(deliveryJobId(cmd, channel), job);
      delivered.push(channel);
    }
    return { channels: delivered, duplicate };
  }

  private async buildJob(
    channel: NotificationChannel,
    cmd: NotifyCommand,
    rendered: RenderedNotification,
    notificationId: string,
    userDevices: readonly { pushToken: string }[],
  ): Promise<NotificationJob | null> {
    const base = { notificationId, userId: cmd.userId };
    if (channel === 'push') {
      if (userDevices.length === 0) return null;
      const tokens = [...new Set(userDevices.map((d) => d.pushToken))].slice(0, 20);
      const data = { ...cmd.data, notificationId, template: cmd.template };
      return { kind: 'push', ...base, tokens, title: rendered.title, body: rendered.body, data };
    }
    if (channel === 'sms' || channel === 'whatsapp') {
      const phone = await this.deps.directory.phoneOf(cmd.userId);
      return phone ? { kind: channel, ...base, phone, text: rendered.text } : null;
    }
    return null;
  }
}
