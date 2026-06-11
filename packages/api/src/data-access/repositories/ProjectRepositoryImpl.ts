import { injectable } from "tsyringe";
import { ProjectModel } from "../models/Project.ts";
import type {
  NewProject,
  Project,
  ProjectChanges,
  ProjectRepository,
  ProjectStatus,
} from "./ProjectRepository.ts";

type ProjectDoc = {
  _id: unknown;
  name: string;
  location: string | null;
  clientId: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
};

/**
 * Mongoose-backed ProjectRepository — the sole owner of project persistence.
 * Org-scoped queries; documents mapped to the plain Project entity on the way
 * out.
 */
@injectable()
export class ProjectRepositoryImpl implements ProjectRepository {
  async findByOrg(orgId: string): Promise<Project[]> {
    const docs = await ProjectModel.find({ orgId })
      .sort({ createdAt: -1 })
      .lean<ProjectDoc[]>();
    return docs.map(toProject);
  }

  async findById(orgId: string, id: string): Promise<Project | null> {
    const doc = await ProjectModel.findOne({ _id: id, orgId }).lean<ProjectDoc | null>();
    return doc ? toProject(doc) : null;
  }

  async countByClient(orgId: string, clientId: string): Promise<number> {
    return ProjectModel.countDocuments({ orgId, clientId });
  }

  async create(orgId: string, data: NewProject): Promise<Project> {
    const doc = await ProjectModel.create({ orgId, ...data });
    return toProject(doc.toObject() as ProjectDoc);
  }

  async update(
    orgId: string,
    id: string,
    changes: ProjectChanges,
  ): Promise<Project | null> {
    const doc = await ProjectModel.findOneAndUpdate({ _id: id, orgId }, changes, {
      new: true,
    }).lean<ProjectDoc | null>();
    return doc ? toProject(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await ProjectModel.deleteOne({ _id: id, orgId });
  }
}

function toProject(doc: ProjectDoc): Project {
  return {
    id: String(doc._id),
    name: doc.name,
    location: doc.location ?? null,
    clientId: doc.clientId,
    description: doc.description ?? null,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}
