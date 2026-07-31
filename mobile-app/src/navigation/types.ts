import { Role } from "@/types";

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { role: Role };
  Register: { role: Role };
  ForgotPassword: { role: Role };
};

export type StudentTabParamList = {
  StudentHome: undefined;
  ApplyHostel: undefined;
  Notices: undefined;
  Grievances: undefined;
  PayFees: undefined;
};

export type RectorTabParamList = {
  RectorDashboard: undefined;
  Applications: undefined;
  Students: undefined;
  PostNotice: undefined;
  RectorGrievances: undefined;
  Rooms: undefined;
};

// Wraps the Rector tab navigator so screens inside it (e.g. Students) can push a
// detail screen on top without losing the tab bar structure underneath.
export type RectorStackParamList = {
  RectorTabs: undefined;
  StudentDetail: { studentId: string };
};

export type WardenTabParamList = {
  CheckInOut: undefined;
  Status: undefined;
};
