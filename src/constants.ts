import defaults from "../functions/runtime-defaults.json";
export const DISCORD =
  import.meta.env.VITE_COMMUNITY_URL || defaults.communityUrl;
export const statusLabel = (status: string) =>
  ({
    registered: "Registered",
    "completion-pending": "Completion pending",
    completed: "Completed",
    "not-attended": "Attendance not confirmed",
    cancelled: "Session cancelled",
    removed: "Records removed",
    revoked: "Completion revoked",
  })[status] || status;
export const activityLabel = (id: string) =>
  id.replaceAll("-", " ").replace(/\b\w/g, (s) => s.toUpperCase());
