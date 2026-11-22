import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type * as ReactNative from 'react-native';
import type * as Sdk from '@delyva/sdk';
import OtpScreen from '../../app/sign-in/otp';
import { api } from '../api/client';
import { useSession } from '../session/session-store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => {
      mockReplace(...a);
    },
  },
  useLocalSearchParams: () => ({ phone: '+2348031234567', resendAfter: '30' }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof ReactNative>('react-native');
  return { SafeAreaView: View };
});

const TOKENS = {
  accessToken: 'h.e30.s',
  accessTokenExpiresIn: 900,
  refreshToken: 'r'.repeat(40),
  tokenType: 'Bearer' as const,
  userId: '00000000-0000-4000-8000-000000000001',
};

function wrap(el: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
}

describe('OTP entry screen', () => {
  beforeEach(() => {
    useSession.setState({ deviceId: 'rider-device-0001', status: 'signedOut' });
    mockReplace.mockClear();
  });

  it('keeps Verify disabled until 6 digits are entered and strips non-digits', async () => {
    await render(wrap(<OtpScreen />));
    const input = screen.getByTestId('otp-input');
    await fireEvent.changeText(input, '12a3');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(input.props.value).toBe('123');
  });

  it('verifies the code with the device id, stores tokens and leaves the screen', async () => {
    // Arrange
    const verify = jest.spyOn(api, 'verifyOtp').mockResolvedValue(TOKENS);
    await render(wrap(<OtpScreen />));

    // Act
    await fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

    // Assert
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    expect(verify).toHaveBeenCalledWith({
      phone: '+2348031234567',
      code: '123456',
      deviceId: 'rider-device-0001',
    });
    expect(useSession.getState().status).toBe('signedIn');
  });

  it('shows a plain-language error for a wrong code', async () => {
    // Arrange
    const { ApiError } = jest.requireActual<typeof Sdk>('@delyva/sdk');
    jest
      .spyOn(api, 'verifyOtp')
      .mockRejectedValue(new ApiError({ type: 'x', title: 'x', status: 401, code: 'otp_invalid' }));
    await render(wrap(<OtpScreen />));

    // Act
    await fireEvent.changeText(screen.getByTestId('otp-input'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

    // Assert
    expect(
      await screen.findByText('That code is not right. Check the SMS and try again.'),
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
