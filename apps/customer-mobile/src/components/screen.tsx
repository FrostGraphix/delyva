import { tokens } from '@delyva/design-tokens';
import { CaretLeftIcon, WifiSlashIcon } from '@delyva/icons/native';
import { AppText, IconButton, OfflineBanner, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnline } from '../api/use-online';
import { t } from '../i18n';

/** Screen props. */
export interface ScreenProps {
  readonly children: ReactNode;
  /** Header title; omit for custom headers. */
  readonly title?: string;
  /** Shows a back button in the header. */
  readonly back?: boolean;
  readonly headerRight?: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  readonly scroll?: boolean;
  /** Sticky bottom area (the one primary action, in the thumb zone). */
  readonly footer?: ReactNode;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  /** Extra bottom padding so content clears the floating tab bar. */
  readonly tabBarInset?: boolean;
  readonly testID?: string;
}

/** Back navigation that never dead-ends (falls back to Home). */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Standard screen shell: safe area, offline banner, header, scroll body and sticky footer. */
export function Screen({
  children,
  title,
  back = false,
  headerRight,
  scroll = true,
  footer,
  onRefresh,
  refreshing = false,
  tabBarInset = false,
  testID,
}: ScreenProps): ReactElement {
  const c = usePalette();
  const online = useOnline();
  const bottom = tabBarInset && !footer ? 120 : tokens.space[6];
  const body = { padding: tokens.space[4], gap: tokens.space[4], paddingBottom: bottom };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']} testID={testID}>
      <OfflineBanner
        visible={!online}
        message={t('common.offline')}
        icon={<WifiSlashIcon size={16} color={c.onButtonInk} />}
      />
      {title || back ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.space[2],
            paddingHorizontal: tokens.space[4],
            paddingTop: tokens.space[2],
          }}
        >
          {back ? (
            <IconButton
              icon={<CaretLeftIcon color={c.text} />}
              accessibilityLabel={t('common.back')}
              onPress={goBack}
              testID="back"
            />
          ) : null}
          {title ? (
            <AppText variant="h2" style={{ flex: 1 }}>
              {title}
            </AppText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {headerRight}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={body}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, ...body }}>{children}</View>
      )}
      {footer ? (
        <SafeAreaView
          edges={['bottom']}
          style={{
            paddingHorizontal: tokens.space[4],
            paddingTop: tokens.space[3],
            paddingBottom: tabBarInset ? 104 : tokens.space[3],
            backgroundColor: c.bg,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          {footer}
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}
