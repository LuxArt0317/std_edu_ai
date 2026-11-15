import {Button} from '@/components/ui/button';
import {campusAssistantOpenEvent} from '../PublicAssistant';

export function ServiceNoticeAssistant() {
  return <Button type="button" size="sm" variant="outline" aria-label="Ask Campus Assistant"
    onClick={event=>window.dispatchEvent(new CustomEvent(campusAssistantOpenEvent,{detail:event.currentTarget}))}>
    校園助理 · Assistant
  </Button>;
}
