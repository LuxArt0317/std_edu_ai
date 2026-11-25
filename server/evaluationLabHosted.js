import { createEvaluationLab } from "../tools/evaluation-lab/server.mjs";
import { validateEvaluationModel } from "../tools/evaluation-lab/models.mjs";
import { verifyAffairsToken } from "./affairsWorkspace.js";
import { withAssistantModel } from "./assistantModelConfig.js";
import publicAssistant from "./researchAssistantHandler.js";

const first = (value) => (Array.isArray(value) ? value[0] : value);
class LabError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
async function rpc(account, name, body = {}) {
  const response = await fetch(`${account.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: account.key,
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok) {
    const status = response.status;
    throw new LabError(
      status === 409
        ? "The evaluation library changed in another tab. Refresh before saving again."
        : status === 401 || status === 403
          ? "Answer Lab requires one of its authorized Google administrator accounts."
          : "The hosted evaluation store is unavailable. Its database migration may still need to be applied.",
      status === 409 ? 409 : status === 401 || status === 403 ? 403 : 503,
    );
  }
  return response.json();
}
export async function serveEvaluationLab(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const origin = first(req.headers.origin);
    const host =
      first(req.headers["x-forwarded-host"]) || first(req.headers.host);
    if (origin && new URL(origin).host !== host)
      throw new LabError("Use Answer Lab on this same website.", 403);
    const token = first(req.headers.authorization)?.replace(/^Bearer /, "");
    const account = await verifyAffairsToken(token || "");
    // SQL authorizes the two requested verified Google identities for the shared lab.
    await rpc(account, "evaluation_lab_access");
    const operation = first(req.query?.op);
    if (typeof operation !== "string" || !/^[a-z-]+$/.test(operation))
      throw new LabError("Choose an evaluation operation.", 400);
    if (operation === "run-public" || operation === "run-account") {
      if (req.method !== "POST")
        throw new LabError("Use POST to run a question.", 405);
      const model = await validateEvaluationModel(
        first(req.headers["x-stu-evaluation-model"]),
      );
      const reasoning =
        first(req.headers["x-stu-evaluation-reasoning"]) || "medium";
      if (!["low", "medium", "high"].includes(reasoning))
        throw new LabError("Invalid reasoning effort.", 400);
      res.setHeader("X-STU-Evaluation-Model", model);
      const handler = operation === "run-account"
        ? (await import("./affairsAssistantRuntime.js")).default : publicAssistant;
      if (typeof handler !== "function")
        throw new LabError("The evaluation handler is unavailable in this release.");
      await withAssistantModel({ model, reasoning }, () => handler(req, res));
      return;
    }
    let revision = 0;
    const storage = {
      async load() {
        const result = await rpc(account, "evaluation_lab_read");
        revision = result.revision;
        return result.document;
      },
      async save(document) {
        const result = await rpc(account, "evaluation_lab_save", {
          p_expected_revision: revision,
          p_document: document,
        });
        revision = result.revision;
      },
      async readAttachment(id) {
        const result = await rpc(account, "evaluation_lab_attachment_read", {
          p_id: id,
        });
        return Buffer.from(result.content, "base64");
      },
      async writeAttachment(id, bytes) {
        await rpc(account, "evaluation_lab_attachment_save", {
          p_id: id,
          p_content: bytes.toString("base64"),
        });
      },
    };
    const handler = createEvaluationLab(process.cwd(), {
      storage,
      actor: { id: account.user.id, email: account.user.email },
      workspace: {
        id: "shared-answer-lab",
        label: "Shared Answer Lab",
        role: "admin",
      },
      maxStateBytes: 3_000_000,
      operation,
      revision:
        process.env.VERCEL_GIT_COMMIT_SHA || "hosted revision unavailable",
    });
    // Node Functions and the local adapter provide a parsed JSON body.
    await handler(req, res);
  } catch (error) {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    res.status(error.status || 503).json({
      error: error.message || "Answer Lab is temporarily unavailable.",
    });
  }
}
