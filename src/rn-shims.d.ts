// Minimal typings so the package builds without installing React Native. Apps get the real types
// from their own react-native / react-native-webview; this file is not published.
declare module 'react-native' {
  export interface ViewStyle { [key: string]: unknown }
  export type StyleProp<T> = T | readonly StyleProp<T>[] | null | undefined | false;
  import type { ComponentType } from 'react';
  export const View: ComponentType<Record<string, unknown>>;
  export const Platform: { OS: 'ios' | 'android' | 'web' | (string & {}) };
  export const AppState: { addEventListener(type: 'change', fn: (state: string) => void): { remove(): void } };
  export const PermissionsAndroid: {
    PERMISSIONS: { CAMERA: string };
    check(permission: string): Promise<boolean>;
    request(permission: string): Promise<string>;
  };
}
declare module 'react-native-webview' {
  import type { ComponentType } from 'react';
  export const WebView: ComponentType<Record<string, unknown>>;
}
