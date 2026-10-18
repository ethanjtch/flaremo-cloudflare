import { Hono } from "hono";
import type { HonoBindings } from "../../context";
export const memosCurrentApi = new Hono<HonoBindings>();

export { isLegacyWireRequest } from "./helpers";

import { registerAttachmentRoutes } from "./attachment-routes";
import { registerAuthRoutes } from "./auth-routes";
import { registerInstanceRoutes } from "./instance-routes";
import { registerMemoRoutes } from "./memo-routes";
import { registerUserRoutes } from "./user-routes";

registerInstanceRoutes(memosCurrentApi);
registerAuthRoutes(memosCurrentApi);
registerMemoRoutes(memosCurrentApi);
registerAttachmentRoutes(memosCurrentApi);
registerUserRoutes(memosCurrentApi);
