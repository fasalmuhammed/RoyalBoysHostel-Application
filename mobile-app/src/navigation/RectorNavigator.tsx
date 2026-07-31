import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { RectorStackParamList, RectorTabParamList } from "./types";
import RectorDashboardScreen from "@/screens/rector/RectorDashboardScreen";
import ApplicationsScreen from "@/screens/rector/ApplicationsScreen";
import StudentsScreen from "@/screens/rector/StudentsScreen";
import StudentDetailScreen from "@/screens/rector/StudentDetailScreen";
import PostNoticeScreen from "@/screens/rector/PostNoticeScreen";
import RectorGrievancesScreen from "@/screens/rector/RectorGrievancesScreen";
import RoomsScreen from "@/screens/rector/RoomsScreen";
import { colors } from "@/constants/theme";

const Tab = createBottomTabNavigator<RectorTabParamList>();
const Stack = createNativeStackNavigator<RectorStackParamList>();

const icons: Record<keyof RectorTabParamList, keyof typeof Ionicons.glyphMap> = {
  RectorDashboard: "stats-chart",
  Applications: "document-text",
  Students: "people",
  PostNotice: "megaphone",
  RectorGrievances: "chatbox-ellipses",
  Rooms: "business",
};

function RectorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          const base = icons[route.name as keyof RectorTabParamList];
          return <Ionicons name={focused ? base : (`${base}-outline` as keyof typeof Ionicons.glyphMap)} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="RectorDashboard" component={RectorDashboardScreen} options={{ title: "Dashboard" }} />
      <Tab.Screen name="Applications" component={ApplicationsScreen} options={{ title: "Applications" }} />
      <Tab.Screen name="Students" component={StudentsScreen} options={{ title: "Students" }} />
      <Tab.Screen name="PostNotice" component={PostNoticeScreen} options={{ title: "Notices" }} />
      <Tab.Screen name="RectorGrievances" component={RectorGrievancesScreen} options={{ title: "Grievances" }} />
      <Tab.Screen name="Rooms" component={RoomsScreen} options={{ title: "Rooms" }} />
    </Tab.Navigator>
  );
}

export default function RectorNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="RectorTabs" component={RectorTabs} options={{ headerShown: false }} />
      <Stack.Screen name="StudentDetail" component={StudentDetailScreen} options={{ title: "Student Record" }} />
    </Stack.Navigator>
  );
}
