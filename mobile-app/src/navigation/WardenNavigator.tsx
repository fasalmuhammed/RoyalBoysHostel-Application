import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { WardenTabParamList } from "./types";
import CheckInOutScreen from "@/screens/warden/CheckInOutScreen";
import StatusScreen from "@/screens/warden/StatusScreen";
import { colors } from "@/constants/theme";

const Tab = createBottomTabNavigator<WardenTabParamList>();

const icons: Record<keyof WardenTabParamList, keyof typeof Ionicons.glyphMap> = {
  CheckInOut: "swap-horizontal",
  Status: "search",
};

export default function WardenNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          const base = icons[route.name as keyof WardenTabParamList];
          return <Ionicons name={focused ? base : (`${base}-outline` as keyof typeof Ionicons.glyphMap)} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="CheckInOut" component={CheckInOutScreen} options={{ title: "Check In/Out" }} />
      <Tab.Screen name="Status" component={StatusScreen} options={{ title: "Status" }} />
    </Tab.Navigator>
  );
}
