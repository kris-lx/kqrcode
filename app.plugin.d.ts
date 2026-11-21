/** Expo config plugin for kqrcode/react-native: adds the iOS and Android camera permission entries. */
export interface KqrcodePluginProps {
  /** iOS NSCameraUsageDescription. Default: "Allow $(PRODUCT_NAME) to use the camera to scan QR codes". */
  cameraPermission?: string;
}
export default function withKqrcode(config: Record<string, any>, props?: KqrcodePluginProps): Record<string, any>;
