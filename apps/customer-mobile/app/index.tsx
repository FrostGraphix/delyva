import { themeColors, tokens } from '@delyva/design-tokens';
import { MapPinIcon } from '@delyva/icons/native';
import { Button } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { Text, useColorScheme, View } from 'react-native';

/** First screen scaffold: tokens, a design-system button and a native icon. */
export default function HomeScreen(): ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = themeColors(scheme);
  // DEBT(i18n): hard-coded English copy — i18n setup lands with onboarding — move to message catalogues.
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'flex-end',
        padding: tokens.space[4],
        gap: tokens.space[6],
      }}
    >
      <MapPinIcon size={32} color={colors.accentText} accessibilityLabel="Delyva" />
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: tokens.type.h1.size,
          lineHeight: tokens.type.h1.line,
          fontWeight: '800',
        }}
      >
        Hungry? We deliver in 35 minutes.
      </Text>
      <Button label="Set delivery address" variant="brand" size="lg" onPress={() => undefined} />
    </View>
  );
}
