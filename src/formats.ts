/**
 * Every member of the QR family (names as in the Barcode Detection API):
 *  - `qr_code`       QR Code, Model 1 and Model 2 (versions 1–40)
 *  - `micro_qr_code` Micro QR Code (M1–M4)
 *  - `rm_qr_code`    Rectangular Micro QR Code, rMQR (R7x43 … R17x139)
 */
export type QRFormat = 'qr_code' | 'micro_qr_code' | 'rm_qr_code';
export const QR_FORMATS: readonly QRFormat[] = ['qr_code', 'micro_qr_code', 'rm_qr_code'];
