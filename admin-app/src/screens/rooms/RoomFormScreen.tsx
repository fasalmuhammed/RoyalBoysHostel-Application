import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { createRoom, getRoom, updateRoom } from "@/services/rooms";
import { parseAmount } from "@/utils/validate";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RoomForm">;

export default function RoomFormScreen({ navigation, route }: Props) {
  const roomId = route.params?.roomId;
  const isEditing = Boolean(roomId);
  const { settings, invalidate } = useApp();

  const [block, setBlock] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [rent, setRent] = useState(String(settings.defaultRent));
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
      // Shrinking below the current headcount would leave students in a room
      // that reports negative vacancy, so it is blocked outright.
      next.capacity = `${occupied} students already live here. Move some out first.`;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const payload = {
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
        <SectionTitle title="Identity" />
        <View style={styles.row}>
          <Input
            label="Block"
            value={block}
            onChangeText={setBlock}
            placeholder="A"
            containerStyle={{ width: 90 }}
            autoCapitalize="characters"
          />
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
          hint="Used to price new invoices for students in this room."
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
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: "row", gap: spacing.md },
});
