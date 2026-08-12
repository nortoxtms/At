/// <reference types="expo/types" />

/**
 * Expo inlines `EXPO_PUBLIC_*` variables at build time, so `process` exists
 * only as those literal substitutions — the Node global is not available at
 * runtime. Declaring just this shape keeps the rest of the Node API out of
 * autocomplete in a React Native app, where reaching for it would compile and
 * then fail on device.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_FIREBASE_API_KEY?: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
    EXPO_PUBLIC_POSTHOG_KEY?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  };
};
