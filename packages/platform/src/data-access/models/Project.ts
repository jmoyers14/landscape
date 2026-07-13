import { Schema, model } from "mongoose";

const PROJECT_STATUSES = [
  "lead",
  "estimating",
  "won",
  "lost",
  "in_progress",
  "completed",
] as const;

/**
 * A job the contractor is bidding or running, owned by an organization and
 * tied to a client. `status` moves through a small state machine enforced in
 * ProjectService — the enum here is just a storage-level guard.
 */
const projectSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, default: null, trim: true },
    clientId: { type: String, required: true, index: true },
    description: { type: String, default: null, trim: true },
    status: {
      type: String,
      required: true,
      enum: PROJECT_STATUSES,
      default: "lead",
    },
  },
  { timestamps: true },
);

projectSchema.index({ orgId: 1, createdAt: -1 });

export const ProjectModel = model("Project", projectSchema);
