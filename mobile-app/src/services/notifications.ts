import { doc, updateDoc } from "firebase/firestore";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { db } from "@/firebase/config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Requests permission, grabs an Expo push token, and stores it on the user's
// Firestore profile so a Cloud Function can target them later (see functions/index.js).
export async function registerForPushNotificationsAsync(uid: string) {
  if (!Device.isDevice) return; // push tokens require a physical device / real push service

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  await updateDoc(doc(db, "users", uid), { pushToken: tokenResponse.data });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}
