import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePageSize } from "../routes/memos-current/helpers";
import { createAppTestHarness } from "../test-support/app";
import { createTestRuntime, TEST_PASSWORD } from "../test-support/runtime";
import { bootstrapAndSignIn } from "../test-support/sign-in";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchCurrent } = createAppTestHarness(() => ({
  env,
  sessionCookie,
}));

describe("Third-party client compatibility surface (Moe Memos, modern REST, Connect)", () => {
  it("honors the 200-memo page size requested by Moe Memos without raising other list limits", () => {
    expect(parsePageSize("200", 50, 200)).toBe(200);
    expect(parsePageSize("200", 50)).toBe(100);
  });

  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      name: "flaremo-client-compat",
      suffix: "source",
    }));
    sessionCookie = await bootstrapAndSignIn(env);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("serves instance and workspace profile probes anonymously and with auth", async () => {
    // 1. GET /api/v1/instance/profile anonymously
    const instanceResp = await fetchCurrent(
      "http://flaremo.test/api/v1/instance/profile",
      { method: "GET" },
      { authenticated: false },
    );
    expect(instanceResp.status).toBe(200);
    const instanceData = (await instanceResp.json()) as Record<string, unknown>;
    expect(instanceData).toMatchObject({
      version: expect.any(String),
      demo: false,
      instanceUrl: expect.any(String),
    });

    // 2. GET /api/v1/workspace/profile anonymously
    const workspaceResp = await fetchCurrent(
      "http://flaremo.test/api/v1/workspace/profile",
      { method: "GET" },
      { authenticated: false },
    );
    expect(workspaceResp.status).toBe(200);
    const workspaceData = (await workspaceResp.json()) as Record<
      string,
      unknown
    >;
    expect(workspaceData.version).toBe(instanceData.version);

    // 3. Legacy v0 probe endpoints must NOT advertise a version: Moe Memos
    //    would otherwise classify this instance as a v0 (Memos 0.21.x) server
    //    and then fail to decode v0 payloads.
    const statusResp = await fetchCurrent(
      "http://flaremo.test/api/v1/status",
      { method: "GET" },
      { authenticated: false },
    );
    expect(statusResp.status).toBe(404);

    const pingResp = await fetchCurrent(
      "http://flaremo.test/api/v1/ping",
      { method: "GET" },
      { authenticated: false },
    );
    expect(pingResp.status).toBe(404);
    expect(instanceData.version).toBe("0.30.0");

    // 4. Connect RPC: memos.api.v1.WorkspaceService/GetWorkspaceProfile
    const connectResp = await fetchCurrent(
      "http://flaremo.test/memos.api.v1.WorkspaceService/GetWorkspaceProfile",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      { authenticated: false },
    );
    expect(connectResp.status).toBe(200);
    const connectData = (await connectResp.json()) as { version: string };
    expect(connectData.version).toBeDefined();
  });

  it("serves user settings and stats, tolerance on memoId and attachmentId, and comments", async () => {
    const signInResponse = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/signin",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          passwordCredentials: {
            username: "owner",
            password: TEST_PASSWORD,
          },
        }),
      },
      { authenticated: false },
    );
    const signIn = (await signInResponse.json()) as { accessToken: string };
    const bearer = { authorization: `Bearer ${signIn.accessToken}` };

    // 1. GET /api/v1/users/:user/settings/GENERAL
    const settingResp = await fetchCurrent(
      "http://flaremo.test/api/v1/users/owner/settings/GENERAL",
      { headers: bearer },
    );
    expect(settingResp.status).toBe(200);
    const settingData = (await settingResp.json()) as {
      name: string;
      generalSetting: { memoVisibility: string };
    };
    expect(settingData.name).toBe("users/owner/settings/GENERAL");
    expect(settingData.generalSetting.memoVisibility).toBe("PRIVATE");

    // 2. GET /api/v1/users/:user/stats
    const statsResp = await fetchCurrent(
      "http://flaremo.test/api/v1/users/owner/stats",
      { headers: bearer },
    );
    expect(statsResp.status).toBe(200);
    const statsData = (await statsResp.json()) as {
      tagCount: Record<string, number>;
    };
    expect(statsData.tagCount).toBeDefined();

    // 2b. GET /api/v1/users/:user:getStats
    const getStatsResp = await fetchCurrent(
      "http://flaremo.test/api/v1/users/owner:getStats",
      { headers: bearer },
    );
    expect(getStatsResp.status).toBe(200);

    // 2c. Legacy v0 current-user endpoint is intentionally not served.
    const userMeResp = await fetchCurrent(
      "http://flaremo.test/api/v1/user/me",
      { headers: bearer },
    );
    expect(userMeResp.status).not.toBe(200);

    // Moe Memos' discover screen uses this CEL membership filter.
    const discoverResp = await fetchCurrent(
      "http://flaremo.test/api/v1/memos?pageSize=20&filter=visibility%20in%20%5B%22PUBLIC%22%2C%22PROTECTED%22%5D",
      { headers: bearer },
    );
    expect(discoverResp.status).toBe(200);

    // 3. Create memo with memoId (tolerance check)
    const memoResp = await fetchCurrent(
      "http://flaremo.test/api/v1/memos?memoId=custom-client-id",
      {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: JSON.stringify({
          memoId: "custom-client-id",
          content: "Hello from Moe Memos! #client",
          visibility: "PRIVATE",
        }),
      },
    );
    expect(memoResp.status).toBe(200);
    const memo = (await memoResp.json()) as { name: string };
    const memoUid = memo.name.replace(/^memos\//, "");

    // 4. Create and list comments: /api/v1/memos/:memo/comments
    const createCommentResp = await fetchCurrent(
      `http://flaremo.test/api/v1/memos/${memoUid}/comments`,
      {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: JSON.stringify({
          content: "This is a comment",
        }),
      },
    );
    expect(createCommentResp.status).toBe(200);

    const listCommentsResp = await fetchCurrent(
      `http://flaremo.test/api/v1/memos/${memoUid}/comments`,
      { headers: bearer },
    );
    expect(listCommentsResp.status).toBe(200);
    const commentsData = (await listCommentsResp.json()) as {
      memos: Array<{ content: string }>;
    };
    expect(commentsData.memos.length).toBe(1);
    expect(commentsData.memos[0].content).toBe("This is a comment");

    // 5. Create attachment with attachmentId (tolerance check)
    const attachResp = await fetchCurrent(
      "http://flaremo.test/api/v1/attachments?attachmentId=probe-123",
      {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: JSON.stringify({
          attachmentId: "probe-123",
          filename: "probe.txt",
          type: "text/plain",
          content: "TWVtb0Zsb3cgQVBJIHByb2JlLg==",
        }),
      },
    );
    expect(attachResp.status).toBe(200);
  });
});
