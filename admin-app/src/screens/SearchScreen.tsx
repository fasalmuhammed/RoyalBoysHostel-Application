import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { EmptyState, SectionTitle } from "@/components/Base";
import { SearchBar } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, spacing, type } from "@/constants/theme";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { globalSearch, SearchHit } from "@/services/overview";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

/**
 * One search box across inmates, rooms, bills and notices.
 *
 * Scoped to the active branch like everything else, so a search never turns up
 * someone from the other hostel.
 */
export default function SearchScreen({ navigation }: Props) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 200);

  const { data: results } = useAsyncData(() => globalSearch(debounced), [debounced]);

  const open = (hit: SearchHit) => {
    if (hit.kind === "inmate") navigation.navigate("InmateDetail", { studentId: hit.id });
    else if (hit.kind === "room") navigation.navigate("RoomDetail", { roomId: hit.id });
    else if (hit.kind === "fee") navigation.navigate("FeeDetail", { feeId: hit.id });
    else navigation.navigate("NoticeForm", { noticeId: hit.id });
  };

  const icon = (kind: SearchHit["kind"]): keyof typeof Ionicons.glyphMap =>
    kind === "room" ? "bed-outline" : kind === "fee" ? "receipt-outline" : "megaphone-outline";

  const group = (title: string, hits: SearchHit[]) =>
    hits.length === 0 ? null : (
      <View key={title}>
        <SectionTitle title={`${title} (${hits.length})`} />
        {hits.map((hit) => (
          <Pressable
            key={`${hit.kind}-${hit.id}`}
            onPress={() => open(hit)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            {hit.kind === "inmate" ? (
              <Avatar name={hit.title} photoFile={hit.photoFile} size={40} />
            ) : (
              <View style={styles.icon}>
                <Ionicons name={icon(hit.kind)} size={18} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {hit.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {hit.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
      </View>
    );

  const showPrompt = debounced.trim().length < 2;
  const nothingFound = !showPrompt && results !== null && results.total === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={term}
          onChangeText={setTerm}
          placeholder="Search inmates, rooms, bills, notices"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {showPrompt ? (
          <EmptyState
            icon="search-outline"
            title="Search everything"
            message="Type at least two characters to look across inmates, rooms, bills and notices in this branch."
          />
        ) : nothingFound ? (
          <EmptyState
            icon="search-outline"
            title="No matches"
            message={`Nothing in this branch matches "${debounced}".`}
          />
        ) : (
          <>
            {group("Inmates", results?.inmates ?? [])}
            {group("Rooms", results?.rooms ?? [])}
            {group("Bills", results?.fees ?? [])}
            {group("Notices", results?.notices ?? [])}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.bodyStrong, color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
