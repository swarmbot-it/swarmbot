import { readFile } from "fs/promises";
import { insertDoc, users as listUsers, type CouchDoc } from "../couch.js";
import type nano from "nano";
import { derivePassword } from "../auth/password.js";
import yaml from "js-yaml";

export async function initUsersFromConfig(
  couchDb: nano.DocumentScope<CouchDoc>
): Promise<void> {
  const path = process.env.SWARMBOT_USERS_CONFIG ?? "/run/configs/users.yaml";
  try {
    const raw = await readFile(path, "utf8");
    const doc = yaml.load(raw) as { users?: Array<Record<string, unknown>> };
    const users = doc?.users ?? [];
    for (const u of users) {
      const username = u.username as string | undefined;
      const passwordHash = u.password_hash as string | undefined;
      const plainPassword = u.password as string | undefined;
      const envPassword =
        u.password_env && process.env[String(u.password_env)]
          ? String(process.env[String(u.password_env)])
          : undefined;
      const storedPassword =
        passwordHash ??
        (plainPassword !== undefined ? derivePassword(plainPassword) : undefined) ??
        (envPassword !== undefined ? derivePassword(envPassword) : undefined);
      if (!username || !storedPassword) continue;
      const existing = await listUsers(couchDb);
      if (existing.some((x) => x.username === username)) continue;
      await insertDoc(couchDb, {
        type: "user",
        username,
        password: storedPassword,
        email: (u.email as string) ?? "",
        role: (u.role as string) ?? "user",
      });
      console.log("Created user from config:", username);
    }
  } catch {
    /* file missing is OK */
  }
}

export async function bootstrapAdminIfEmpty(
  couchDb: nano.DocumentScope<CouchDoc>
): Promise<void> {
  const existing = await listUsers(couchDb);
  if (existing.length > 0) return;
  const u = process.env.SWARMBOT_BOOTSTRAP_ADMIN ?? process.env.SWARMPIT_BOOTSTRAP_ADMIN;
  const p =
    process.env.SWARMBOT_BOOTSTRAP_PASSWORD ?? process.env.SWARMPIT_BOOTSTRAP_PASSWORD;
  if (!u || !p) {
    console.warn(
      "No users in database. Set SWARMBOT_BOOTSTRAP_ADMIN and SWARMBOT_BOOTSTRAP_PASSWORD or mount users.yaml."
    );
    return;
  }
  await insertDoc(couchDb, {
    type: "user",
    username: u,
    password: derivePassword(p),
    email: "",
    role: "admin",
  });
  console.log("Bootstrap admin user created:", u);
}
