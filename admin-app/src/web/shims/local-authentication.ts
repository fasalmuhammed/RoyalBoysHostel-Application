/**
 * Browser stand-in for `expo-local-authentication`.
 *
 * Fingerprint and face unlock are phone hardware the artifact frame cannot
 * reach, so this reports no biometric support. The screens already hide the
 * biometric option in that case and the PIN stays the way in.
 */

export const AuthenticationType = { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 } as const;

export async function hasHardwareAsync(): Promise<boolean> {
  return false;
}

export async function isEnrolledAsync(): Promise<boolean> {
  return false;
}

export async function supportedAuthenticationTypesAsync(): Promise<number[]> {
  return [];
}

export async function authenticateAsync(_options?: unknown): Promise<{ success: false; error: string }> {
  return { success: false, error: "not_available" };
}
