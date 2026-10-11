import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { colors, font, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { Loading } from "@/components/Base";

import LockScreen from "@/screens/LockScreen";
import BranchPickerScreen from "@/screens/BranchPickerScreen";
import DashboardScreen from "@/screens/DashboardScreen";
import MoreScreen from "@/screens/MoreScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import ReportsScreen from "@/screens/ReportsScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import AdminPanelScreen from "@/screens/AdminPanelScreen";
import SearchScreen from "@/screens/SearchScreen";
import ChangePinScreen from "@/screens/ChangePinScreen";

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

import ComplaintsScreen from "@/screens/complaints/ComplaintsScreen";
import ComplaintFormScreen from "@/screens/complaints/ComplaintFormScreen";
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

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "grid-outline",
  Inmates: "people-outline",
  Rooms: "bed-outline",
  Fees: "wallet-outline",
  More: "ellipsis-horizontal",
};

/**
 * The active tab is marked by a filled icon as well as colour, so the current
 * position is still readable to someone who cannot separate the violet from
 * the grey.
 */
const TAB_ICONS_ACTIVE: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "grid",
  Inmates: "people",
  Rooms: "bed",
  Fees: "wallet",
  More: "ellipsis-horizontal",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          // Height comes from the safe-area-aware default; only the breathing
          // room around the icons is set here, so a gesture-bar phone and a
          // button-navigation phone both sit correctly.
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontFamily: font.semibold },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? TAB_ICONS_ACTIVE[route.name] : TAB_ICONS[route.name]}
            size={size - 2}
            color={color}
          />
        ),
      })}
    >
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
  // Slide from the right on both platforms so a push always reads as "deeper
  // in", and the gesture back matches it.
  animation: "slide_from_right" as const,
  headerTitleStyle: { fontFamily: font.semibold, fontSize: fontSize.md },
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
        name="Complaints"
        component={ComplaintsScreen}
        options={{ ...detailOptions, title: "Complaints" }}
      />
      <Stack.Screen name="ComplaintForm" component={ComplaintFormScreen} options={detailOptions} />

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
        name="AdminPanel"
        component={AdminPanelScreen}
        options={{ ...detailOptions, title: "Admin panel" }}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ ...detailOptions, title: "Reports" }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={detailOptions} />
      <Stack.Screen
        name="ChangePin"
        component={ChangePinScreen}
        options={{ ...detailOptions, title: "Change PIN" }}
      />
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
 * The PIN lock is this device's own quick re-lock on top of that.
 */
export default function RootNavigator() {
  const { ready, startupError, user, hasPin, locked, activeBranch } = useApp();

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
      ) : hasPin && locked ? (
        <LockScreen />
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
