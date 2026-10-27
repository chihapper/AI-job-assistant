import { Badge } from "./ui";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";

const tones: Record<ApplicationStatus, "neutral" | "green" | "amber" | "red" | "blue" | "violet"> = {
  saved: "neutral",
  applying: "blue",
  applied: "blue",
  screening: "violet",
  interviewing: "violet",
  offer: "green",
  rejected: "red",
  withdrawn: "neutral",
  ghosted: "amber",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={tones[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function FitBadge({ overall, score }: { overall?: string | null; score?: number | null }) {
  if (!overall) return null;
  const tone = overall === "strong" ? "green" : overall === "good" ? "blue" : overall === "partial" ? "amber" : "red";
  return (
    <Badge tone={tone}>
      Fit: {overall}
      {typeof score === "number" ? ` · ${score}%` : ""}
    </Badge>
  );
}
