import {isDeepStrictEqual} from 'node:util';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const localPrivacySavePath='/api/affairs-conversations';

export function inspectLocalPrivacyReply(reply,{answer,activity=[],grounding}){
  const expected={status:'handoff',answer,citations:[],suggestedQuestions:[],activity,...(grounding?{grounding}:{})};
  const [stored]=sanitizeStoredConversation([{id:'a0',role:'assistant',content:answer,result:expected}]);
  check(isDeepStrictEqual(reply,stored.result),'save answer mismatch');
  return {citations:[],views:[]};
}
