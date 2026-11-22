/** Public build-time env vars inlined by Expo (never secrets). */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL?: string;
    readonly EXPO_PUBLIC_PRICING_ZONE_CODE?: string;
  }
}

declare const process: { readonly env: NodeJS.ProcessEnv };
