import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/context/AuthContext";
import AuthNavigator from "./AuthNavigator";
import StudentNavigator from "./StudentNavigator";
import RectorNavigator from "./RectorNavigator";
import WardenNavigator from "./WardenNavigator";
import PendingApprovalScreen from "@/screens/rector/PendingApprovalScreen";
import { colors } from "@/constants/theme";

export default function RootNavigator() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user && <AuthNavigator />}
      {user?.role === "student" && <StudentNavigator />}
      {user?.role === "rector" && (user.status === "approved" ? <RectorNavigator /> : <PendingApprovalScreen />)}
      {user?.role === "warden" && <WardenNavigator />}
    </NavigationContainer>
  );
}
