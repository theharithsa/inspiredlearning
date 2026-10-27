export interface Profile {
  name?: string;
  email?: string;
  learningPoints?: number;
}
export interface Workshop {
  id: string;
  sid: string;
  name: string;
  title: string;
  date?: string | null;
  teamId: string;
  role: string;
  status: string;
  revision: number;
  certificateId?: string;
  learningPoints?: number;
  personalCredits?: number | null;
  teamCredits?: number | null;
  teamRank?: number | null;
  personalActivities?: string[];
  teamActivities?: string[];
  networking?: string[];
  awards?: string[];
  personalQuiz?: Record<
    string,
    { answer: number; correct: boolean; credits: number }
  > | null;
  surveyPre?: Record<string, number> | null;
  surveyPost?: Record<string, number> | null;
}
export interface Certificate {
  kind?: "participation" | "award";
  awardTitle?: string;
  awards?: string[];
  id: string;
  uid: string;
  sid: string;
  name: string;
  title: string;
  date: string;
  status: string;
  public: boolean;
  revision: number;
}
export interface StaffStudent {
  uid: string;
  name: string;
  teamId: string;
  role: string;
  attendance: string;
  resultStatus: string;
  revision: number;
}
export interface Roster {
  sid: string;
  title: string;
  date: string;
  complete: boolean;
  facilitator: boolean;
  region: string | null;
  students: StaffStudent[];
}

export interface LearnerRequest {
  id: string;
  uid: string;
  email?: string;
  reason?: string;
  kind: string;
  status: string;
  resolution?: string;
  resolutionAction?: string;
  createdAt?: { seconds: number };
  resolvedAt?: { seconds: number };
}
export interface BatchResult {
  message?: string;
  results?: { uid: string; status: string; message?: string }[];
}

export interface StaffWorkflowProps {
  roster: Roster;
  selected: string[];
  setSelected: (uids: string[]) => void;
  reason: string;
  setReason: (reason: string) => void;
  busy: boolean;
  run: (work: () => Promise<BatchResult>) => Promise<void>;
}
