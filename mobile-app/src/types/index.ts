export type Role = "rector" | "warden" | "student";

export type RectorStatus = "pending" | "approved";
export type HostelResidencyStatus = "active" | "left";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  pushToken?: string;
  createdAt: number;
  // Only meaningful for role === "rector": gates access until an existing
  // approved rector approves the account, so registration can't self-elevate.
  status?: RectorStatus;
  // Only meaningful for role === "student": absent/undefined means "active".
  // Set to "left" when the Rector marks them as having vacated the hostel.
  hostelStatus?: HostelResidencyStatus;
}

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface HostelApplication {
  id: string;
  // null until claimed by a matching mobile registration (web-form submissions
  // start unclaimed — see services/applications.ts claimPendingApplications).
  studentId: string | null;
  studentName: string;
  // Contact email; always set for web-form submissions (used to claim the
  // application once the applicant registers in the mobile app), optional
  // for mobile-originated applications (student is already authenticated).
  applicantEmail?: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  address: string;
  idProof: string;
  income: number;
  status: ApplicationStatus;
  roomId?: string;
  createdAt: number;
}

export interface Notice {
  id: string;
  date: string;
  message: string;
  createdBy: string;
  createdAt: number;
}

export type GrievanceStatus = "open" | "resolved";

export interface Grievance {
  id: string;
  studentId: string;
  username: string;
  hostelBlock: string;
  roomNo: string;
  message: string;
  status: GrievanceStatus;
  createdAt: number;
}

export type PaymentStatus = "pending" | "confirmed";

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  transactionId: string;
  status: PaymentStatus;
  createdAt: number;
}

export type CheckType = "in" | "out";

export interface CheckLog {
  id: string;
  studentId: string;
  studentName: string;
  type: CheckType;
  date: string;
  time: string;
  wardenId: string;
  createdAt: number;
}

export interface Room {
  id: string;
  block: string;
  roomNumber: string;
  capacity: number;
  occupantIds: string[];
}
