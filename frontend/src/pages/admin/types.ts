export type AdminStatus = "operational" | "down";
export type JobStatus = "pending" | "processing" | "done" | "failed";
export type JobType = "photo_analysis" | "quiz_generation";

export interface AdminStatusData {
  status: AdminStatus;
  checkedAt: string;
}

export interface CostData {
  totalMicrodollars: number;
  totalDollars: string;
  byUser: Array<{
    userId: string;
    photoMicrodollars: number;
    quizGenMicrodollars: number;
    totalMicrodollars: number;
  }>;
  byDay: Array<{ date: string; totalMicrodollars: number }>;
}

export interface JobItem {
  id: string;
  type: JobType;
  status: JobStatus;
  stale: boolean;
  attempts: number;
  maxAttempts: number;
  userId: string;
  summary: string;
  costMicrodollars: number | null;
  createdAt: string;
  updatedAt: string;
  failureCode?: string | null;
  modelId?: string | null;
  modelConfigVersion?: number | null;
}

export interface JobAttempt {
  id: string;
  attemptNumber: number;
  status: JobStatus;
  trigger: string;
  modelConfigVersion?: number | null;
  modelId?: string | null;
  failureCode?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface JobsData {
  jobs: JobItem[];
  counts: Record<JobStatus, number>;
}

export interface JobDetailData {
  job: JobItem;
  attempts: JobAttempt[];
}

export interface CatalogModel {
  id: string;
  canonicalSlug: string;
  name: string;
  inputModalities: string[];
  outputModalities: string[];
  contextLength?: number | null;
  supportedParameters: string[];
  reasoningEfforts?: string[];
  promptPrice?: string | null;
  completionPrice?: string | null;
}

export interface ModelConfig {
  version: number;
  status: "draft" | "active" | "superseded" | "rejected";
  photoAnalysisModel: string;
  quizGenerationModel: string;
  wordDiscoveryModel: string;
  validationStatus: "pending" | "passed" | "failed";
  failureCode?: string | null;
  createdAt: string;
}

export interface InviteItem {
  id: string;
  email: string;
  code: string;
  status: string;
  createdAt: string;
}
