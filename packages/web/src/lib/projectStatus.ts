export type ProjectStatus =
  | "lead"
  | "estimating"
  | "won"
  | "lost"
  | "in_progress"
  | "completed";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: "Lead",
  estimating: "Estimating",
  won: "Won",
  lost: "Lost",
  in_progress: "In progress",
  completed: "Completed",
};

// Legal next moves. The server is authoritative about transitions; this map
// only decides which options the UI offers.
export const NEXT_STATUSES: Record<ProjectStatus, ProjectStatus[]> = {
  lead: ["estimating", "lost"],
  estimating: ["won", "lost"],
  won: ["in_progress", "lost"],
  in_progress: ["completed"],
  completed: [],
  lost: ["estimating"],
};
