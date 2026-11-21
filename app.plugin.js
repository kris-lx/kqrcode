/**
 * Expo config plugin for kqrcode/react-native. Adds the camera permission entries on prebuild / EAS:
 *
 *   "plugins": ["kqrcode"]
 *   "plugins": [["kqrcode", { "cameraPermission": "Scan QR codes to pay" }]]
 *
 * iOS: NSCameraUsageDescription (an existing text is kept unless you pass cameraPermission).
 * Android: android.permission.CAMERA. Expo Go needs nothing: it already has both.
 */
const DEFAULT_TEXT = 'Allow $(PRODUCT_NAME) to use the camera to scan QR codes';

/** @param {Record<string, any>} config @param {{ cameraPermission?: string }} [props] */
export default function withKqrcode(config, props = {}) {
  const infoPlist = { ...(config.ios && config.ios.infoPlist) };
  if (props.cameraPermission || !infoPlist.NSCameraUsageDescription) {
    infoPlist.NSCameraUsageDescription = props.cameraPermission || DEFAULT_TEXT;
  }
  const permissions = [...((config.android && config.android.permissions) || [])];
  if (!permissions.some((p) => p === 'CAMERA' || p === 'android.permission.CAMERA')) {
    permissions.push('android.permission.CAMERA');
  }
  return {
    ...config,
    ios: { ...config.ios, infoPlist },
    android: { ...config.android, permissions },
  };
}
