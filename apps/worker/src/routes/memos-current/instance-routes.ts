import { FLAREMO_API_VERSION } from "@flaremo/contracts";
import { currentUserToDto, publicUserToDto } from "@flaremo/memos";
import type { Hono } from "hono";
import {
  getFlareMoDb,
  getOptionalRequestContext,
  type HonoBindings,
} from "../../context";
import { getAuthUserCached } from "../../identity-cache";
import { currentJsonError } from "../../memos-compat/current-errors";
import { getPublicInstanceContext } from "../memos-connect/shared";
import { isLegacyWireRequest } from "./helpers";

export function registerInstanceRoutes(app: Hono<HonoBindings>) {
  app.get("/instance/profile", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const db = getFlareMoDb(c.env);
      const optionalContext = await getOptionalRequestContext(c);
      const publicContext = optionalContext.user
        ? optionalContext
        : await getPublicInstanceContext(c);
      const admin = optionalContext.authUserId
        ? currentUserToDto(
            optionalContext.user,
            await getAuthUserCached(db, optionalContext.authUserId),
          )
        : publicUserToDto(publicContext.user);

      return c.json({
        version: FLAREMO_API_VERSION,
        demo: false,
        instanceUrl: c.env.FLAREMO_PUBLIC_URL ?? new URL(c.req.url).origin,
        admin,
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.get("/workspace/profile", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const db = getFlareMoDb(c.env);
      const optionalContext = await getOptionalRequestContext(c);
      const publicContext = optionalContext.user
        ? optionalContext
        : await getPublicInstanceContext(c);
      const admin = optionalContext.authUserId
        ? currentUserToDto(
            optionalContext.user,
            await getAuthUserCached(db, optionalContext.authUserId),
          )
        : publicUserToDto(publicContext.user);

      return c.json({
        version: FLAREMO_API_VERSION,
        demo: false,
        instanceUrl: c.env.FLAREMO_PUBLIC_URL ?? new URL(c.req.url).origin,
        admin,
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.get("/status", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    return c.json({
      profile: {
        version: FLAREMO_API_VERSION,
        mode: "prod",
      },
      version: FLAREMO_API_VERSION,
    });
  });

  app.get("/ping", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    return c.json({
      profile: {
        version: FLAREMO_API_VERSION,
        mode: "prod",
      },
      version: FLAREMO_API_VERSION,
    });
  });
}
