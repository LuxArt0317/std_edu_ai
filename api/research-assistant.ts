import handler from "../server/researchAssistantHandler.js";

export {createResearchAssistantHandler,detectEvidenceConflict} from "../server/researchAssistantHandler.js";
export const config = {maxDuration:60};
export default handler;
