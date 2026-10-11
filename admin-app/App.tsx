import React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Imported face by face, not from the package root: that index requires all
// thirty-six weights, which pulls roughly 12 MB of unused fonts into the
// bundle and every over-the-air update.
import Inter_400Regular from "@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf";
import Inter_500Medium from "@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf";
import Inter_600SemiBold from "@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf";
import Inter_700Bold from "@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf";
import Inter_800ExtraBold from "@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf";

import { colors } from "@/constants/theme";
import { AppProvider } from "@/context/AppContext";
import RootNavigator from "@/navigation/RootNavigator";
import DialogHost from "@/web/DialogHost";
import SyncBanner from "@/components/SyncBanner";
import { useFrameWidth } from "@/web/frame";

/**
 * The app is laid out for phones. On a wider screen it sits in a centred
 * column of phone width (wider for the admin panel), on the same background.
 */
function AppFrame({ children }: { children: React.ReactNode }) {
  const maxWidth = useFrameWidth();
  return (
    <View style={{ flex: 1, width: "100%", maxWidth, alignSelf: "center", backgroundColor: colors.background }}>
      {children}
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  /**
   * Holds on the splash colour while Inter loads.
   *
   * `expo-splash-screen` would time this more precisely, but it is native
   * code: adding it would force a full rebuild for every change in this pass,
   * a poor trade for hiding about one frame. The fonts are bundled locally, so
   * this is brief, and matching the splash colour makes the handoff invisible.
   *
   * `fontError` counts as ready on purpose -- a font that fails to load must
   * never leave the admin staring at a blank coloured screen.
   */
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.primaryDark }} />;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <AppFrame>
          <RootNavigator />
          <SyncBanner />
        </AppFrame>
        <DialogHost />
      </AppProvider>
    </SafeAreaProvider>
  );
}
