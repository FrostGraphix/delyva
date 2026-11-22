import type { MenuItem } from '@delyva/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ItemSheet } from './item-sheet';
import { OtpForm } from './otp-form';
import { PriceBreakdown } from './price-breakdown';

const ngn = (amountMinor: number): { amountMinor: number; currency: 'NGN' } => ({
  amountMinor,
  currency: 'NGN',
});
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const item: MenuItem = {
  id: id(1),
  categoryId: id(2),
  name: 'Party jollof',
  description: null,
  price: ngn(350_000),
  available: true,
  modifierGroups: [
    {
      id: id(10),
      name: 'Protein',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: id(11), name: 'Beef', priceDelta: ngn(50_000), available: true },
        { id: id(12), name: 'Chicken', priceDelta: ngn(120_000), available: true },
      ],
    },
  ],
};

describe('ItemSheet', () => {
  it('blocks adding until the required group is chosen, then returns the server option ids', async () => {
    const onAdd = jest.fn();
    await render(<ItemSheet item={item} onClose={jest.fn()} onAdd={onAdd} />);
    await fireEvent.press(screen.getByLabelText(/^Add to cart/));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Choose at least 1.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Chicken/));
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    expect(screen.getByLabelText(/Add to cart · ₦9,400\.00/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Add to cart/));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ optionIds: [id(12)], quantity: 2, unitPreviewMinor: 470_000 }),
    );
  });
});

describe('OtpForm', () => {
  it('auto-submits on the sixth digit, strips non-digits and shows the resend countdown', async () => {
    const onVerify = jest.fn();
    await render(
      <OtpForm
        phone="+2348031234567"
        resendAfterSeconds={30}
        onVerify={onVerify}
        onResend={jest.fn()}
        onChangeNumber={jest.fn()}
        verifying={false}
        error={null}
      />,
    );
    expect(screen.getByText('Resend code in 30s')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('otp-input'), '12ab3456');
    expect(onVerify).toHaveBeenCalledWith('123456');
  });

  it('shows the error message', async () => {
    await render(
      <OtpForm
        phone="+2348031234567"
        resendAfterSeconds={0}
        onVerify={jest.fn()}
        onResend={jest.fn()}
        onChangeNumber={jest.fn()}
        verifying={false}
        error="That code didn't work."
      />,
    );
    expect(screen.getByTestId('otp-error')).toBeTruthy();
    expect(screen.getByText('Resend code')).toBeTruthy();
  });
});

describe('PriceBreakdown', () => {
  it('renders server amounts as given, discount negative, total last', async () => {
    await render(
      <PriceBreakdown
        rows={[
          { key: 'price.items', amountMinor: 350_000 },
          { key: 'price.discount', amountMinor: -50_000 },
          { key: 'price.total', amountMinor: 300_000, emphasis: true },
        ]}
      />,
    );
    expect(screen.getByLabelText('Items ₦3,500.00')).toBeTruthy();
    expect(screen.getByLabelText('Discount -₦500.00')).toBeTruthy();
    expect(screen.getByLabelText('Total ₦3,000.00')).toBeTruthy();
  });
});
