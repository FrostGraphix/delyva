import type { VendorCategory } from '@delyva/contracts';
import {
  BasketIcon,
  ForkKnifeIcon,
  type IconProps,
  PillIcon,
  StorefrontIcon,
} from '@delyva/icons/native';
import type { ReactElement } from 'react';
import { t } from '../i18n';

/** Localised category name. */
export function categoryLabel(c: VendorCategory): string {
  return t(`category.${c}`);
}

/** Category glyph from the shared icon family (decorative). */
export function CategoryGlyph({
  category,
  ...props
}: IconProps & { readonly category: VendorCategory }): ReactElement {
  switch (category) {
    case 'restaurant':
    case 'bakery':
      return <ForkKnifeIcon {...props} />;
    case 'grocery':
      return <BasketIcon {...props} />;
    case 'pharmacy':
      return <PillIcon {...props} />;
    case 'shop':
      return <StorefrontIcon {...props} />;
  }
}
