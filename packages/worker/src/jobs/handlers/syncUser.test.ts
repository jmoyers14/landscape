import { describe, expect, it } from "bun:test";
import type { UserInput, UserRepository, WebhookEvent } from "@landscape/platform";
import { SyncUserHandler } from "./syncUser.ts";

/**
 * Captures the upsert so the test can assert what got mirrored, without a
 * database. Only `upsertByAuthId` is exercised by this handler.
 */
class FakeUserRepository implements UserRepository {
  public upserts: UserInput[] = [];

  async upsertByAuthId(input: UserInput) {
    this.upserts.push(input);
    return {
      id: "row_1",
      ...input,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
  async findByAuthId() {
    return null;
  }
  async deleteByAuthId() {}
}

const event = (data: unknown): WebhookEvent => ({
  id: "evt_1",
  source: "clerk",
  sourceEventId: "msg_1",
  type: "user.created",
  payload: data,
  receivedAt: "2026-01-01T00:00:00.000Z",
});

describe("SyncUserHandler", () => {
  it("mirrors a Clerk user into an upsert keyed by auth id", async () => {
    const repo = new FakeUserRepository();
    await new SyncUserHandler(repo).handle(
      event({
        id: "user_abc",
        first_name: "Ada",
        last_name: "Lovelace",
        image_url: "https://img/ada.png",
        primary_email_address_id: "idn_2",
        email_addresses: [
          { id: "idn_1", email_address: "old@example.com" },
          { id: "idn_2", email_address: "ada@example.com" },
        ],
      }),
    );

    expect(repo.upserts).toHaveLength(1);
    expect(repo.upserts[0]).toEqual({
      authUserId: "user_abc",
      email: "ada@example.com", // the primary, resolved via primary_email_address_id
      firstName: "Ada",
      lastName: "Lovelace",
      imageUrl: "https://img/ada.png",
    });
  });

  it("falls back to the first email when no primary is marked", async () => {
    const repo = new FakeUserRepository();
    await new SyncUserHandler(repo).handle(
      event({
        id: "user_abc",
        primary_email_address_id: null,
        email_addresses: [{ id: "idn_1", email_address: "first@example.com" }],
      }),
    );

    expect(repo.upserts[0]?.email).toBe("first@example.com");
  });

  it("tolerates a user with no name and no email", async () => {
    const repo = new FakeUserRepository();
    await new SyncUserHandler(repo).handle(event({ id: "user_abc" }));

    expect(repo.upserts[0]).toEqual({
      authUserId: "user_abc",
      email: null,
      firstName: null,
      lastName: null,
      imageUrl: null,
    });
  });

  it("throws on a payload with no user id, so the job is recorded as failed", async () => {
    const repo = new FakeUserRepository();

    await expect(
      new SyncUserHandler(repo).handle(event({ first_name: "NoId" })),
    ).rejects.toThrow();
    expect(repo.upserts).toHaveLength(0);
  });
});
