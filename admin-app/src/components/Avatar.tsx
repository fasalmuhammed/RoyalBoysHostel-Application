import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors, fontSize } from "@/constants/theme";
import { initials } from "@/utils/format";
import { photoUri } from "@/services/photos";

interface Props {
  name: string;
  photoFile?: string | null;
  size?: number;
}

/**
 * Inmate photo, falling back to initials.
 *
 * `photoUri` returns null when the file is missing, so a backup restored
 * without its images degrades to initials rather than a broken-image box.
 */
export default function Avatar({ name, photoFile, size = 46 }: Props) {
  const uri = photoUri(photoFile);
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensions]} resizeMode="cover" />;
  }

  return (
    <View style={[styles.fallback, dimensions]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.primaryLight },
  fallback: {
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: colors.primary, fontWeight: "700", fontSize: fontSize.md },
});
