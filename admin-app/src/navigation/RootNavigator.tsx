import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import GlassTabBar from "@/components/GlassTabBar";

import { colors, font, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { Loading } from "@/components/Base";

import BranchPickerScreen from "@/screens/BranchPickerScreen";
import DashboardScreen from "@/screens/DashboardScreen";
import MoreScreen from "@/screens/MoreScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import ReportsScreen from "@/screens/ReportsScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import StaffScreen from "@/screens/StaffScreen";
import AdmissionsScreen from "@/screens/admissions/AdmissionsScreen";
import AdmissionReviewScreen from "@/screens/admissions/AdmissionReviewScreen";
import JoinQrScreen from "@/screens/admissions/JoinQrScreen";
import SearchScreen from "@/screens/SearchScreen";

import InmatesScreen from "@/screens/inmates/InmatesScreen";
import InmateFormScreen from "@/screens/inmates/InmateFormScreen";
import InmateDetailScreen from "@/screens/inmates/InmateDetailScreen";

import RoomsScreen from "@/screens/rooms/RoomsScreen";
import RoomFormScreen from "@/screens/rooms/RoomFormScreen";
import RoomDetailScreen from "@/screens/rooms/RoomDetailScreen";
import AssignInmatesScreen from "@/screens/rooms/AssignInmatesScreen";

import FeesScreen from "@/screens/fees/FeesScreen";
import FeeDetailScreen from "@/screens/fees/FeeDetailScreen";
import FeeFormScreen from "@/screens/fees/FeeFormScreen";
import CollectFeeScreen from "@/screens/fees/CollectFeeScreen";
import DuesScreen from "@/screens/fees/DuesScreen";

import MessagesScreen from "@/screens/messages/MessagesScreen";
import ComposeScreen from "@/screens/messages/ComposeScreen";
import SendQueueScreen from "@/screens/messages/SendQueueScreen";
import TemplatesScreen from "@/screens/messages/TemplatesScreen";

import NoticesScreen from "@/screens/notices/NoticesScreen";
import NoticeFormScreen from "@/screens/notices/NoticeFormScreen";

import LoginScreen from "@/screens/LoginScreen";

import type { MainTabParamList, RootStackParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Inmates" component={InmatesScreen} />
      <Tab.Screen name="Rooms" component={RoomsScreen} />
      <Tab.Screen name="Fees" component={FeesScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

const detailOptions = {
  headerShown: true,
  headerBackTitle: "Back",
  headerTitleAlign: "center" as const,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.background },
  // Slide from the right on both platforms so a push always reads as "deeper
  // in", and the gesture back matches it.
  animation: "slide_from_right" as const,
  headerTitleStyle: { fontFamily: font.semibold, fontSize: fontSize.md + 2, color: colors.text },
  headerShadowVisible: false,
};

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />

      <Stack.Screen name="InmateForm" component={InmateFormScreen} options={detailOptions} />
      <Stack.Screen
        name="InmateDetail"
        component={InmateDetailScreen}
        options={{ ...detailOptions, title: "Inmate" }}
      />

      <Stack.Screen name="RoomForm" component={RoomFormScreen} options={detailOptions} />
      <Stack.Screen
        name="RoomDetail"
        component={RoomDetailScreen}
        options={{ ...detailOptions, title: "Room" }}
      />

      <Stack.Screen
        name="AssignInmates"
        component={AssignInmatesScreen}
        options={{ ...detailOptions, title: "Add existing student" }}
      />

      <Stack.Screen
        name="FeeDetail"
        component={FeeDetailScreen}
        options={{ ...detailOptions, title: "Bill" }}
      />
      <Stack.Screen name="FeeForm" component={FeeFormScreen} options={detailOptions} />
      <Stack.Screen
        name="CollectFee"
        component={CollectFeeScreen}
        options={{ ...detailOptions, title: "Collect payment" }}
      />
      <Stack.Screen
        name="Dues"
        component={DuesScreen}
        options={{ ...detailOptions, title: "Dues" }}
      />

      <Stack.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ ...detailOptions, title: "WhatsApp" }}
      />
      <Stack.Screen name="Compose" component={ComposeScreen} options={detailOptions} />
      <Stack.Screen
        name="SendQueue"
        component={SendQueueScreen}
        options={{ ...detailOptions, title: "Send messages" }}
      />
      <Stack.Screen
        name="Templates"
        component={TemplatesScreen}
        options={{ ...detailOptions, title: "Templates" }}
      />

      <Stack.Screen
        name="Notices"
        component={NoticesScreen}
        options={{ ...detailOptions, title: "Notice board" }}
      />
      <Stack.Screen name="NoticeForm" component={NoticeFormScreen} options={detailOptions} />


      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ ...detailOptions, title: "Notifications" }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ ...detailOptions, title: "Search" }}
      />

      <Stack.Screen
        name="Admissions"
        component={AdmissionsScreen}
        options={{ ...detailOptions, title: "Applications" }}
      />
      <Stack.Screen
        name="AdmissionReview"
        component={AdmissionReviewScreen}
        options={{ ...detailOptions, title: "Application" }}
      />
      <Stack.Screen
        name="JoinQr"
        component={JoinQrScreen}
        options={{ ...detailOptions, title: "Registration QR code" }}
      />
      <Stack.Screen
        name="Staff"
        component={StaffScreen}
        options={{ ...detailOptions, title: "Logins" }}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ ...detailOptions, title: "Reports" }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={detailOptions} />
    </Stack.Navigator>
  );
}

function StartupError({ message }: { message: string }) {
  return (
    <View style={styles.errorScreen}>
      <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
      <Text style={styles.errorTitle}>The app could not start</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Text style={styles.errorHint}>
        Your data has not been touched. Reopening the app usually resolves this.
      </Text>
    </View>
  );
}

/**
 * Chooses the top-level flow.
 *
 * Login comes first: nothing is loaded until the server knows who is asking.
 */
export default function RootNavigator() {
  const { ready, startupError, user, activeBranch } = useApp();

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Loading label="Opening your hostel records…" />
      </View>
    );
  }

  if (startupError) return <StartupError message={startupError} />;

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? (
        <LoginScreen />
      ) : !activeBranch ? (
        // Nothing in the app is meaningful until a branch is chosen: every
        // list, total and new record is scoped to one.
        <BranchPickerScreen />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.background, justifyContent: "center" },
  errorScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorTitle: { fontSize: fontSize.lg, fontFamily: font.extrabold, color: colors.text },
  errorMessage: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  errorHint: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
