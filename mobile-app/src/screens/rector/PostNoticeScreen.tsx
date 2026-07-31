import React, { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { postNotice, subscribeNotices } from "@/services/notices";
import { Notice } from "@/types";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Card from "@/components/Card";
import ScreenHeader from "@/components/ScreenHeader";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function PostNoticeScreen() {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => subscribeNotices(setNotices), []);

  const onSubmit = async () => {
    if (!user || !date || !message) return;
    setLoading(true);
    try {
      await postNotice(date, message, user.name);
      setDate("");
      setMessage("");
      Alert.alert("Posted", "Notice has been published to all students.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Post a Notice" subtitle="Published notices are visible to all students" />
            <Input label="Date" placeholder="e.g. 2026-08-01" value={date} onChangeText={setDate} />
            <Input label="Notice" value={message} onChangeText={setMessage} multiline numberOfLines={4} />
            <Button title="Publish Notice" onPress={onSubmit} loading={loading} disabled={!date || !message} />
            <Text style={styles.historyTitle}>Recent Notices</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.message}>{item.message}</Text>
          </Card>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  historyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  date: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xs, fontWeight: "600" },
  message: { fontSize: fontSize.md, color: colors.text },
});
