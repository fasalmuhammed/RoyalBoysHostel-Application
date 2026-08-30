import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { colors, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { Loading } from "@/components/Base";

import LockScreen from "@/screens/LockScreen";
import BranchPickerScreen from "@/screens/BranchPickerScreen";
import DashboardScreen from "@/screens/DashboardScreen";
import MoreScreen from "@/screens/MoreScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import ReportsScreen from "@/screens/ReportsScreen";
import BackupScreen from "@/screens/BackupScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
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
import GenerateInvoicesScreen from "@/screens/fees/GenerateInvoicesScreen";

import MessagesScreen from "@/screens/messages/MessagesScreen";
import ComposeScreen from "@/screens/messages/ComposeScreen";
import SendQueueScreen from "@/screens/messages/SendQueueScreen";
import TemplatesScreen from "@/screens/messages/TemplatesScreen";

import NoticesScreen from "@/screens/notices/NoticesScreen";
import NoticeFormScreen from "@/screens/notices/NoticeFormScreen";

import StartChoiceScreen from "@/screens/setup/StartChoiceScreen";
import RestoreExistingScreen from "@/screens/setup/RestoreExistingScreen";
import HostelDetailsScreen from "@/screens/setup/HostelDetailsScreen";
import CreatePinScreen from "@/screens/setup/CreatePinScreen";

import type { MainTabParamList, RootStackParamList, SetupStackParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const SetupStack = createNativeStackNavigator<SetupStackParamList>();

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
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size - 2} color={color} />
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

const detailOptions = { headerShown: true, headerBackTitle: "Back" };

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
        name="GenerateInvoices"
        component={GenerateInvoicesScreen}
        options={{ ...detailOptions, title: "Raise bills" }}
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
        name="Backup"
        component={BackupScreen}
        options={{ ...detailOptions, title: "Backup & restore" }}
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

function SetupFlow() {
  return (
    <SetupStack.Navigator screenOptions={{ headerShown: false }}>
      <SetupStack.Screen name="StartChoice" component={StartChoiceScreen} />
      <SetupStack.Screen
        name="RestoreExisting"
        component={RestoreExistingScreen}
        options={{ headerShown: true, title: "Restore" }}
      />
      <SetupStack.Screen
        name="HostelDetails"
        component={HostelDetailsScreen}
        options={{ headerShown: true, title: "Hostel details" }}
      />
      <SetupStack.Screen
        name="CreatePin"
        component={CreatePinScreen}
        options={{ headerShown: true, title: "Security" }}
      />
    </SetupStack.Navigator>
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
 * Setup runs before the lock screen: a fresh install has no PIN yet, and the
 * restore path must be reachable without one.
 */
export default function RootNavigator() {
  const { ready, startupError, settings, hasPin, locked, activeBranch } = useApp();

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
      {!settings.setupComplete ? (
        <SetupFlow />
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
  errorTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  errorMessage: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  errorHint: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
