import type { AuthedRequest } from "../http/optional-jwt.js";
import type { JwtClaims } from "../auth/jwt.js";
import type { SwarmbotConfig } from "../config.js";
import type Dockerode from "dockerode";
import type nano from "nano";
import type { CouchDoc } from "../couch.js";

export type GraphQLContext = {
  cfg: SwarmbotConfig;
  couchDb: nano.DocumentScope<CouchDoc>;
  docker: Dockerode;
  user: JwtClaims | undefined;
};

export function buildContext(
  req: AuthedRequest,
  cfg: SwarmbotConfig,
  couchDb: nano.DocumentScope<CouchDoc>,
  docker: Dockerode
): GraphQLContext {
  return {
    cfg,
    couchDb,
    docker,
    user: req.swarmUser,
  };
}
