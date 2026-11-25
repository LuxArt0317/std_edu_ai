const compatible =
  /^gpt-(?:6(?:\.[12])?-(?:astra|sol|terra|luna)|5\.6-(?:astra|sol|terra|luna))$/;
let cache;
export async function availableAssistantModels(refresh = false) {
  if (!refresh && cache && Date.now() - cache.at < 300000) return cache.value;
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      "Could not load available models from the configured model account.",
    );
  const payload = await response.json();
  const models = [
    ...new Set(
      (payload.data || [])
        .map((row) => row.id)
        .filter((id) => typeof id === "string" && compatible.test(id)),
    ),
  ]
    .sort()
    .reverse();
  if (!models.length)
    throw new Error(
      "No compatible reasoning models were returned for this model account.",
    );
  const value = {
    models,
    defaultModel: process.env.OPENAI_MODEL || models[0],
    defaultEvaluator:
      process.env.EVALUATION_EVALUATOR_MODEL ||
      process.env.OPENAI_VERIFICATION_MODEL ||
      process.env.OPENAI_MODEL ||
      models[0],
    reasoning: process.env.OPENAI_REASONING_EFFORT || "medium",
  };
  cache = { at: Date.now(), value };
  return value;
}
export async function validateAssistantModel(model) {
  if (typeof model !== "string" || !compatible.test(model))
    throw new Error("Choose a supported model from the evaluation model list.");
  const available = await availableAssistantModels();
  if (!available.models.includes(model))
    throw new Error("That model is not available to the configured account.");
  return model;
}
