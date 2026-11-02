import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { clientForRole } from "../../../tests/helpers/role-client.mjs";
const s = JSON.parse(await readFile("artifacts/tutorials/private-state.json"));
const shots = JSON.parse(await readFile("artifacts/tutorials/captures.json"));
const rows = [];
for (const role of Object.keys(s.users)) {
  const c = await clientForRole(s, role),
    { data, error } = await c.auth.getUser();
  if (error) throw error;
  assert.equal(data.user.app_metadata.role, role);
  rows.push({
    role,
    verified: true,
    captured: Object.values(shots).some((x) => x.role === role && x.complete),
  });
}
assert.ok(rows.every((x) => x.captured));
assert.equal(rows.length, 14);
await writeFile(
  "artifacts/tutorials/roles-verified.json",
  JSON.stringify({ roles: rows, allAuthenticated: true }, null, 2),
);
await writeFile(
  "artifacts/tutorials/cleanup-ids.json",
  JSON.stringify({
    ids: s.ids,
    createdUsers: s.createdUsers,
    marker: s.marker,
  }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    roles: rows.length,
    allAuthenticated: true,
    allCaptured: true,
  }),
);
