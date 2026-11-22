import type { InboxNotification } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { BellIcon } from '@delyva/icons/native';
import { useMarkNotificationRead, useNotifications } from '@delyva/sdk';
import { AppText, Card, StateView, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { QueryBoundary } from '../src/components/query-boundary';
import { Screen } from '../src/components/screen';
import { t } from '../src/i18n';

function Item({
  n,
  onOpen,
}: {
  readonly n: InboxNotification;
  readonly onOpen: () => void;
}): ReactElement {
  const c = usePalette();
  const unread = n.readAt === null;
  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={`${unread ? `${t('inbox.unread')}. ` : ''}${n.title}. ${n.body}`}
      testID="inbox-item"
    >
      <View style={{ flexDirection: 'row', gap: tokens.space[3] }}>
        <View
          style={{
            width: 10,
            height: 10,
            marginTop: 6,
            borderRadius: tokens.radius.pill,
            backgroundColor: unread ? c.primary : 'transparent',
          }}
        />
        <View style={{ flex: 1, gap: tokens.space[1] }}>
          <AppText style={{ fontWeight: unread ? '800' : '600' }}>{n.title}</AppText>
          <AppText tone="muted">{n.body}</AppText>
          <AppText variant="caption" tone="muted">
            {new Date(n.createdAt).toLocaleString('en-NG')}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

/** C34 Notifications inbox (tap marks read and opens the order when linked). */
export default function Inbox(): ReactElement {
  const list = useNotifications(api);
  const markRead = useMarkNotificationRead(api);
  return (
    <Screen
      title={t('inbox.title')}
      back
      testID="inbox"
      onRefresh={() => {
        void list.refetch();
      }}
      refreshing={list.isRefetching}
    >
      <QueryBoundary query={list}>
        {(page) =>
          page.items.length === 0 ? (
            <StateView
              testID="inbox-empty"
              illustration={<BellIcon size={32} color={tokens.color.ink[900]} />}
              title={t('inbox.emptyTitle')}
              message={t('inbox.emptyBody')}
            />
          ) : (
            <View style={{ gap: tokens.space[3] }}>
              {page.items.map((n) => (
                <Item
                  key={n.id}
                  n={n}
                  onOpen={() => {
                    if (n.readAt === null) markRead.mutate(n.id);
                    const orderId = n.data.orderId;
                    if (orderId) router.push({ pathname: '/order/[id]', params: { id: orderId } });
                  }}
                />
              ))}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
