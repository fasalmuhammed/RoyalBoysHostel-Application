import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import BranchChoice from "@/components/BranchChoice";
import { housesOf } from "@/services/branches";
import { isHouse } from "@/store/views";
import { createRoom, getRoom, updateRoom } from "@/services/rooms";
import { parseAmount } from "@/utils/validate";
import { successFeedback } from "@/utils/haptics";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RoomForm">;

export default function RoomFormScreen({ navigation, route }: Props) {
  const roomId = route.params?.roomId;
  const isEditing = Boolean(roomId);
  const { settings, invalidate, allHostels, activeBranch, branches, activeHouse } = useApp();
  const [block, setBlock] = useState("");
  // The room's own hostel when editing; otherwise the one it is being added to.
  const [roomBranchId, setRoomBranchId] = useState<string | null>(null);
  // With both hostels showing, a new room has to be given to one of them.
  const askBranch = !isEditing && allHostels;
  const [branchChoice, setBranchChoice] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | undefined>(undefined);
  const hostelId = isEditing ? roomBranchId : askBranch ? branchChoice : (activeBranch?.id ?? null);
  const houses = housesOf(branches.find((branch) => branch.id === hostelId));
  useEffect(() => {
    if (!isEditing && activeHouse) setBlock((current) => current || activeHouse);
  }, [isEditing, activeHouse]);

  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [amenities, setAmenities] = useState("");
  const [notes, setNotes] = useState("");

  const [occupied, setOccupied] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit room" : "Add room" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const room = await getRoom(roomId);
      if (!room) return;
      setBlock(room.block);
      setRoomBranchId(room.branchId);
      setRoomNumber(room.roomNumber);
      setFloor(room.floor);
      setCapacity(String(room.capacity));
      setRent(String(room.rent));
      setDeposit(String(room.deposit));
      setAmenities(room.amenities);
      setNotes(room.notes);
      setOccupied(room.occupied);
    })();
  }, [roomId]);

  const onSave = async () => {
    const next: Record<string, string | undefined> = {};
    if (!roomNumber.trim()) next.roomNumber = "A room number is required.";

    const capacityValue = Number.parseInt(capacity, 10);
    if (!Number.isFinite(capacityValue) || capacityValue < 1) {
      next.capacity = "Capacity must be at least 1.";
    } else if (isEditing && capacityValue < occupied) {
      // Shrinking below the current headcount would leave inmates in a room
      // that reports negative vacancy, so it is blocked outright.
      next.capacity = `${occupied} inmates already live here. Move some out first.`;
    }

    if (houses.length > 0 && !houses.some((house) => isHouse(block, house))) {
      next.block = "Choose which building this room is in.";
    }
    setErrors(next);
    const noBranch = askBranch && !branchChoice;
    setBranchError(noBranch ? "Choose which hostel this room is in." : undefined);
    if (Object.keys(next).length > 0 || noBranch) return;

    setSaving(true);
    try {
      const payload = {
        // Blank: createRoom stamps the hostel being worked in.
        branchId: askBranch ? (branchChoice ?? "") : "",
        block: block.trim(),
        roomNumber: roomNumber.trim(),
        floor: floor.trim(),
        capacity: capacityValue,
        rent: parseAmount(rent),
        deposit: parseAmount(deposit),
        amenities: amenities.trim(),
        notes: notes.trim(),
      };
      if (roomId) await updateRoom(roomId, payload);
      else await createRoom(payload);

      successFeedback();
      invalidate();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {askBranch ? (
          <BranchChoice
            value={branchChoice}
            onChange={(branchId) => {
              setBranchChoice(branchId);
              setBranchError(undefined);
            }}
            error={branchError}
          />
        ) : null}
        <SectionTitle title="Identity" />
        {houses.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.choiceLabel}>
              Building<Text style={{ color: colors.danger }}> *</Text>
            </Text>
            <View style={styles.choices}>
              {houses.map((house) => {
                const active = isHouse(block, house);
                return (
                  <Pressable
                    key={house}
                    onPress={() => setBlock(house)}
                    style={[styles.choice, active && styles.choiceActive, !!errors.block && !active && { borderColor: colors.danger }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={18} color={active ? colors.primary : colors.textFaint} />
                    <Text style={[styles.choiceText, active && { color: colors.primary }]} numberOfLines={1}>{house}</Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.block ? <Text style={styles.choiceError}>{errors.block}</Text> : null}
          </View>
        ) : null}
        <View style={styles.row}>
          {houses.length > 0 ? null : (
            <Input
              label="Block"
              value={block}
              onChangeText={setBlock}
              placeholder="A"
              containerStyle={{ width: 90 }}
              autoCapitalize="characters"
            />
          )}
          <Input
            label="Room number"
            required
            value={roomNumber}
            onChangeText={setRoomNumber}
            placeholder="101"
            containerStyle={{ flex: 1 }}
            error={errors.roomNumber}
          />
        </View>
        <Input
          label="Floor"
          value={floor}
          onChangeText={setFloor}
          placeholder="e.g. 1st floor"
          icon="layers-outline"
        />

        <SectionTitle title="Capacity & charges" />
        <Input
          label="Beds in this room"
          required
          value={capacity}
          onChangeText={setCapacity}
          placeholder="2"
          keyboardType="number-pad"
          error={errors.capacity}
          icon="bed-outline"
          hint={isEditing ? `${occupied} bed(s) currently occupied.` : undefined}
        />
        <Input
          label={`Monthly rent per bed (${settings.currencySymbol})`}
          value={rent}
          onChangeText={setRent}
          placeholder="6000"
          keyboardType="numeric"
          icon="cash-outline"
          hint="Fills in a inmate's rent when you allocate them here. They can still be set individually."
        />
        <Input
          label={`Security deposit (${settings.currencySymbol})`}
          value={deposit}
          onChangeText={setDeposit}
          placeholder="optional"
          keyboardType="numeric"
          icon="wallet-outline"
        />

        <SectionTitle title="Details" />
        <Input
          label="Amenities"
          value={amenities}
          onChangeText={setAmenities}
          placeholder="e.g. Wi-Fi, AC, Study table"
          icon="sparkles-outline"
        />
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          multiline
        />

        {isEditing && occupied > 0 ? (
          <Callout tone="info" icon="information-circle-outline">
            <CalloutText>
              Changing the rent affects future invoices only. Bills already raised keep the amount
              they were created with.
            </CalloutText>
          </Callout>
        ) : null}

        <Button
          title={isEditing ? "Save changes" : "Add room"}
          onPress={onSave}
          loading={saving}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  choiceLabel: { ...type.support, fontFamily: type.bodyStrong.fontFamily, color: colors.text, marginBottom: spacing.xs + 2 },
  choices: { flexDirection: "row", gap: spacing.sm },
  choice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceText: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  choiceError: { ...type.support, color: colors.danger, marginTop: spacing.xs },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: "row", gap: spacing.md },
});
