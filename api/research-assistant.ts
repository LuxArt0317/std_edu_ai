import {conversationUpdateHandler} from '../server/conversationUpdates.js';
import handler from "../server/researchAssistantHandler.js";
import {withUserAssistantSettings} from '../server/assistantUserSettings.js';

export {createResearchAssistantHandler,detectEvidenceConflict} from "../server/researchAssistantHandler.js";
export const config = {maxDuration:60};
export default withUserAssistantSettings((request,response)=>request.query?.resource==='conversation-update'?conversationUpdateHandler(request,response):handler(request,response));
