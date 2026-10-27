export const APPLICATION_STATUSES = [
  "saved",
  "applying",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applying: "Applying",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

export const ACTIVE_STATUSES: ApplicationStatus[] = [
  "saved",
  "applying",
  "applied",
  "screening",
  "interviewing",
  "offer",
];

export const EVENT_TYPES = [
  "created",
  "status_change",
  "note",
  "email",
  "interview",
  "follow_up",
  "reminder",
  "document",
  "fit",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const DOCUMENT_KINDS = [
  "resume_master",
  "resume_tailored",
  "cover_letter",
  "portfolio",
  "reference",
  "offer",
  "email",
  "job_posting",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  resume_master: "Master resume",
  resume_tailored: "Tailored resume",
  cover_letter: "Cover letter",
  portfolio: "Portfolio",
  reference: "Reference",
  offer: "Offer",
  email: "Email",
  job_posting: "Job posting",
  other: "Other",
};

export const MEMORY_KINDS = ["preference", "constraint", "fact", "insight", "decision"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
