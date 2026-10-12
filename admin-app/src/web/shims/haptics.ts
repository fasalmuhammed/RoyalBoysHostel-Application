/**
 * Browser stand-in for `expo-haptics`. The artifact frame has no vibration
 * motor to drive; feedback is a garnish, so every call quietly resolves.
 */

export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" } as const;
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" } as const;

export async function impactAsync(_style?: string): Promise<void> {}
export async function selectionAsync(): Promise<void> {}
export async function notificationAsync(_type?: string): Promise<void> {}
