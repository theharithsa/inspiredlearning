export const DISCORD = "https://discord.gg/yMUe8Vy3U";
export const statusLabel = (status: string) =>
  ({
    registered: "Registered",
    "completion-pending": "Completion pending",
    completed: "Completed",
    "not-attended": "Attendance not confirmed",
    cancelled: "Session cancelled",
    revoked: "Completion revoked",
  })[status] || status;
export const activityLabel = (id: string) =>
  id.replaceAll("-", " ").replace(/\b\w/g, (s) => s.toUpperCase());
