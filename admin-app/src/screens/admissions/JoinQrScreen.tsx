import React, { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import qrcode from "qrcode-generator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText } from "@/components/Base";
import Button from "@/components/Button";
import { colors, radius, shadow, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { joinLink } from "@/services/admissions";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "JoinQr">;

/** The QR code as a grid of dark/light squares. */
function matrixFor(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/** A printable A4 poster: hostel name, the code, and one line of instruction. */
function posterHtml(hostel: string, link: string, matrix: boolean[][]): string {
  const size = matrix.length;
  const squares = matrix
    .flatMap((row, y) => row.map((dark, x) => (dark ? `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>` : "")))
    .join("");
  const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safe(hostel)} registration</title>
<style>
  @page { size: A4; margin: 0 }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #0F172A; text-align: center }
  .top { background: #0F1B45; color: #fff; padding: 22mm 15mm 16mm }
  .top h1 { margin: 0; font-size: 30pt; letter-spacing: -.5pt }
  .top p { margin: 4mm 0 0; font-size: 15pt; color: #F0C97A }
  .code { width: 120mm; height: 120mm; margin: 18mm auto 10mm; padding: 6mm; border: 1.2mm solid #0F1B45; border-radius: 6mm }
  h2 { font-size: 22pt; margin: 0 0 4mm }
  ol { display: inline-block; text-align: left; font-size: 14pt; line-height: 1.7; margin: 0; padding-left: 8mm }
  .link { margin-top: 10mm; font-size: 10pt; color: #5A6478; word-break: break-all; padding: 0 15mm }
</style></head><body>
  <div class="top"><h1>${safe(hostel)}</h1><p>Student registration</p></div>
  <div class="code"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges" fill="#0F172A">${squares}</svg></div>
  <h2>Scan to register</h2>
  <ol><li>Open your phone camera and point it at the code</li><li>Fill in your details and add your Aadhaar photos</li><li>The office will confirm your admission</li></ol>
  <div class="link">${safe(link)}</div>
</body></html>`;
}

/**
 * The hostel's registration QR code. Students scan it, fill in their own
 * details and photos, and the form waits under "Admissions" for approval.
 */
export default function JoinQrScreen(_: Props) {
  const { activeBranch } = useApp();
  const [printing, setPrinting] = useState(false);
  const link = joinLink(activeBranch?.id ?? null);
  const matrix = useMemo(() => matrixFor(link), [link]);
  const hostel = activeBranch?.name ?? "Hostel";
  // Whole pixels per square: fractions leave hairline gaps between them.
  const cell = Math.max(3, Math.floor(240 / matrix.length));

  const onPrint = async () => {
    setPrinting(true);
    try {
      const html = posterHtml(hostel, link, matrix);
      if (Platform.OS === "web") {
        // A browser prints (or saves as PDF) from its own print window.
        const page = window.open("", "_blank");
        if (!page) {
          Alert.alert("Allow pop-ups", "The browser blocked the print page. Allow pop-ups for this site and try again.");
          return;
        }
        page.document.write(html);
        page.document.close();
        page.focus();
        setTimeout(() => page.print(), 300);
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      Alert.alert("Could not print", "Try again, or share the link instead.");
    } finally {
      setPrinting(false);
    }
  };

  const onShare = async () => {
    try {
      await Share.share({ message: `${hostel} registration form: ${link}` });
    } catch {
      // Closed without sharing; nothing to do.
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.poster}>
          <View style={styles.posterTop}>
            <Text style={styles.posterHostel} numberOfLines={2}>{hostel}</Text>
            <Text style={styles.posterSub}>Student registration</Text>
          </View>
          <View style={styles.codeWrap}>
            <View accessibilityLabel="Registration QR code">
              {matrix.map((row, y) => (
                <View key={y} style={styles.codeRow}>
                  {row.map((dark, x) => (
                    <View key={x} style={[{ width: cell, height: cell }, dark && styles.cellDark]} />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <Text style={styles.scan}>Scan to register</Text>
          <Text style={styles.link} selectable numberOfLines={2}>{link}</Text>
        </View>

        <Button title="Print the poster" icon="print-outline" onPress={onPrint} loading={printing} />
        <View style={{ height: spacing.sm }} />
        <Button title="Share the link" icon="share-social-outline" variant="secondary" onPress={onShare} />

        <View style={{ height: spacing.lg }} />
        <Callout tone="info">
          <CalloutText>
            Each hostel has its own code. Print it and put it up at the office. A student who scans it fills in their
            details, photo and both sides of their Aadhaar card. Nothing is added to the records until you approve it
            under Admissions.
          </CalloutText>
        </Callout>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  poster: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    alignItems: "center",
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    ...shadow.card,
  },
  posterTop: {
    alignSelf: "stretch",
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  posterHostel: { ...type.title, color: colors.onDark, textAlign: "center" },
  posterSub: { ...type.support, color: colors.goldLight, marginTop: 2 },
  codeWrap: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    backgroundColor: colors.surface,
  },
  codeRow: { flexDirection: "row" },
  cellDark: { backgroundColor: colors.text },
  scan: { ...type.section, color: colors.text, marginTop: spacing.md },
  link: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
});
