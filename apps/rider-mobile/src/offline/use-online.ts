import { useNetworkState } from 'expo-network';

/** True unless the OS reports no connection (unknown counts as online so we still try). */
export function useOnline(): boolean {
  const state = useNetworkState();
  return state.isConnected !== false;
}
