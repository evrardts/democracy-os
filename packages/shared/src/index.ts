// Enums
export enum UserRole {
  CITIZEN = 'citizen',
  OFFICIAL = 'official',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  // Legacy values
  ELECTED_OFFICIAL = 'elected_official',
  ADMINISTRATION = 'administration',
}

export enum PollType {
  QUICK_POLL = 'quick_poll',
  MULTI_STAGE = 'multi_stage',
}

export enum PollStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

export enum VoteType {
  UPVOTE = 'upvote',
  DOWNVOTE = 'downvote',
}

export enum ReportReason {
  SPAM = 'spam',
  HATE = 'hate',
  OFF_TOPIC = 'off_topic',
  HARASSMENT = 'harassment',
}

export enum CommitmentStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum ConsultationStage {
  IDEA_COLLECTION = 'idea_collection',
  SHORTLIST_SELECTION = 'shortlist_selection',
  FINAL_ARBITRATION = 'final_arbitration',
}

export enum IdeaStatus {
  SUBMITTED = 'submitted',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
  WINNER = 'winner',
}

// Base types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  displayName: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithSalt extends User {
  secretSalt: string; // Only include in secure contexts
}

export interface PollOption {
  id: string;
  text: string;
}

export interface Poll {
  id: string;
  tenantId: string;
  creatorId: string;
  title: string;
  description?: string;
  pollType: PollType;
  status: PollStatus;
  startTime?: Date;
  endTime?: Date;
  options: PollOption[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Vote {
  id: string;
  pollId: string;
  nullifier: string;
  optionId: string;
  voteTimestamp: Date;
  previousVoteId?: string;
}

export interface Comment {
  id: string;
  pollId: string;
  userId: string;
  parentId?: string;
  content: string;
  editHistory: CommentEdit[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentEdit {
  content: string;
  editedAt: Date;
}

export interface CommentWithAuthor extends Comment {
  author: {
    id: string;
    displayName: string;
  };
  upvotes: number;
  downvotes: number;
  score: number;
  userVote?: VoteType;
  reportCount: number;
}

export interface CommentVote {
  id: string;
  commentId: string;
  userId: string;
  voteType: VoteType;
  createdAt: Date;
}

export interface CommentReport {
  id: string;
  commentId: string;
  reporterId: string;
  reason: ReportReason;
  createdAt: Date;
}

export interface Attachment {
  filename: string;
  url: string;
  uploadedAt: Date;
}

export interface Document {
  id: string;
  key: string; // S3 key
  url: string; // Public or presigned URL
  filename: string;
  size: number; // File size in bytes
  mimeType: string;
  createdAt: Date;
}

export interface Commitment {
  id: string;
  tenantId: string;
  creatorId: string;
  title: string;
  description?: string;
  responsibleParty?: string;
  plannedBudget?: number;
  actualBudget?: number;
  targetDate?: Date;
  status: CommitmentStatus;
  version: number;
  previousVersionId?: string;
  attachments: Attachment[];
  documentIds?: string[]; // Array of document UUIDs
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, any>;
  payloadHash: string;
  previousEventHash?: string;
  createdAt: Date;
}

// API request/response types
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  tenantSlug: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface CreatePollRequest {
  title: string;
  description?: string;
  pollType: PollType;
  startTime?: Date;
  endTime?: Date;
  options: Omit<PollOption, 'id'>[];
  tags?: string[];
}

export interface UpdatePollRequest {
  title?: string;
  description?: string;
  status?: PollStatus;
  startTime?: Date;
  endTime?: Date;
  tags?: string[];
}

export interface VoteRequest {
  optionId: string;
}

export interface VoteResponse {
  success: boolean;
  vote: Vote;
}

export interface PollResults {
  pollId: string;
  totalVotes: number;
  results: {
    optionId: string;
    optionText: string;
    count: number;
    percentage: number;
  }[];
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface CommentVoteRequest {
  voteType: VoteType;
}

export interface CommentReportRequest {
  reason: ReportReason;
}

export interface CreateCommitmentRequest {
  title: string;
  description?: string;
  responsibleParty?: string;
  plannedBudget?: number;
  targetDate?: Date;
  documentIds?: string[];
}

export interface UpdateCommitmentRequest {
  title?: string;
  description?: string;
  responsibleParty?: string;
  plannedBudget?: number;
  actualBudget?: number;
  targetDate?: Date;
  status?: CommitmentStatus;
  documentIds?: string[];
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error types
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

// Multi-stage consultation types
export interface ConsultationIdea {
  id: string;
  pollId: string;
  submitterId: string;
  title: string;
  description: string;
  upvotes: number;
  downvotes: number;
  status: IdeaStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsultationIdeaWithAuthor extends ConsultationIdea {
  submitter: {
    id: string;
    displayName: string;
  };
  score: number;
  userVote?: VoteType;
}

export interface ConsultationIdeaVote {
  id: string;
  ideaId: string;
  userId: string;
  voteType: VoteType;
  createdAt: Date;
}

export interface ConsultationStageInfo {
  id: string;
  pollId: string;
  currentStage: ConsultationStage;
  stage1Start?: Date;
  stage1End?: Date;
  stage2Start?: Date;
  stage2End?: Date;
  stage3Start?: Date;
  stage3End?: Date;
  minIdeasForStage2: number;
  shortlistSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIdeaRequest {
  title: string;
  description: string;
}

export interface VoteOnIdeaRequest {
  voteType: VoteType;
}

export interface CreateMultiStageConsultationRequest extends CreatePollRequest {
  stage1Start: Date;
  stage1End: Date;
  stage2Start: Date;
  stage2End: Date;
  stage3Start: Date;
  stage3End: Date;
  minIdeasForStage2?: number;
  shortlistSize?: number;
}

export interface TransitionStageRequest {
  nextStage: ConsultationStage;
}
