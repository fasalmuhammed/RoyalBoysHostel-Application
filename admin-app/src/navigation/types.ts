import type { NavigatorScreenParams } from "@react-navigation/native";
import type { MessageKind } from "@/types";

export type MainTabParamList = {
  Dashboard: undefined;
  Inmates: { filter?: "all" | "active" | "left" | "unassigned" } | undefined;
  Rooms: undefined;
  Fees: { filter?: "all" | "due" | "paid" | "unpaid" | "partial"; period?: string | null } | undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;

  InmateForm: { studentId?: string; presetRoomId?: string } | undefined;
  InmateDetail: { studentId: string };

  RoomForm: { roomId?: string } | undefined;
  RoomDetail: { roomId: string };
  AssignInmates: { roomId: string };

  FeeDetail: { feeId: string };
  FeeForm: { feeId?: string; studentId?: string } | undefined;
  CollectFee: { feeId: string };
  Dues: undefined;

  Messages: undefined;
  Compose:
    | {
        kind: MessageKind;
        studentIds?: string[];
        feeIds?: string[];
        /** Seeds the composer, e.g. with a notice's text. */
        presetBody?: string;
        /** Stamped as sent once the batch is prepared. */
        noticeId?: string;
      }
    | undefined;
  SendQueue: { batchId: string };
  Templates: undefined;

  Notices: undefined;
  NoticeForm: { noticeId?: string } | undefined;

  Complaints: undefined;
  ComplaintForm: { complaintId?: string; roomId?: string } | undefined;

  Notifications: undefined;
  Search: undefined;

  AdminPanel: undefined;
  Staff: undefined;

  Admissions: undefined;
  AdmissionReview: { applicationId: string };
  JoinQr: undefined;
  Reports: undefined;
  Settings: undefined;
  ChangePin: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
