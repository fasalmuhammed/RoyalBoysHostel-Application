import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { StudentTabParamList } from "./types";
import StudentHomeScreen from "@/screens/student/StudentHomeScreen";
import ApplyHostelScreen from "@/screens/student/ApplyHostelScreen";
import NoticesScreen from "@/screens/student/NoticesScreen";
import GrievancesScreen from "@/screens/student/GrievancesScreen";
import PayFeesScreen from "@/screens/student/PayFeesScreen";
import { colors } from "@/constants/theme";

const Tab = createBottomTabNavigator<StudentTabParamList>();

const icons: Record<keyof StudentTabParamList, keyof typeof Ionicons.glyphMap> = {
  StudentHome: "home",
  ApplyHostel: "document-text",
  Notices: "megaphone",
  Grievances: "chatbox-ellipses",
  PayFees: "card",
};

export default function StudentNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          const base = icons[route.name as keyof StudentTabParamList];
          return <Ionicons name={focused ? base : (`${base}-outline` as keyof typeof Ionicons.glyphMap)} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="StudentHome" component={StudentHomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="ApplyHostel" component={ApplyHostelScreen} options={{ title: "Apply" }} />
      <Tab.Screen name="Notices" component={NoticesScreen} options={{ title: "Notices" }} />
      <Tab.Screen name="Grievances" component={GrievancesScreen} options={{ title: "Grievances" }} />
      <Tab.Screen name="PayFees" component={PayFeesScreen} options={{ title: "Fees" }} />
    </Tab.Navigator>
  );
}
