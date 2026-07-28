import { injectable } from "tsyringe";
import type { TaskAuthenticator } from "./TaskAuthenticator.ts";

/**
 * Local-development authenticator: allows every request to `/tasks/*`.
 *
 * Safe only because it's registered ONLY when environment is local, where the
 * queue is InlineTaskQueue looping back to localhost with no token to check.
 * The composition root must never wire this outside local — see the worker
 * container, which fails closed (refuses to boot) rather than fall back to this
 * when the real OIDC verifier isn't available.
 */
@injectable()
export class AllowAllTaskAuthenticator implements TaskAuthenticator {
  async authenticate(): Promise<boolean> {
    return true;
  }
}
