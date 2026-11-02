import json,re,difflib
from pathlib import Path
from faster_whisper import WhisperModel
root=Path(__file__).resolve().parents[3]
content=json.loads((root/'media/tutorials/content.json').read_text())
out=root/'artifacts/tutorials/qc-speech';out.mkdir(exist_ok=True)
model=WhisperModel('base.en',device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,download_root=str(root/'artifacts/tutorials/qc-models'))
for ep in content['episodes']:
 for sc in ep['scenes']:
  path=out/(sc['id']+'.json')
  if path.exists():continue
  segs,info=model.transcribe(str(root/'artifacts/tutorials/assets/audio'/(sc['id']+'.mp3')),language='en',beam_size=3,word_timestamps=True,vad_filter=True,condition_on_previous_text=False,initial_prompt='STU Nexus. DEMO101. Courses. Assessments. Registrar. AI assistant.')
  segments=[dict(start=s.start,end=s.end,text=s.text,words=[dict(start=w.start,end=w.end,word=w.word,probability=w.probability) for w in (s.words or[])]) for s in segs]
  actual=' '.join(s['text'].strip() for s in segments)
  def norm(x):
   x=x.lower().replace('s t u','stu').replace('s.t.u.','stu').replace('a i','ai')
   return re.findall(r"[a-z0-9]+(?:'[a-z]+)?",x)
  a,b=norm(sc['narration']),norm(actual);diff=list(difflib.SequenceMatcher(None,a,b).get_opcodes());edits=[dict(kind=k,expected=' '.join(a[i:j]),actual=' '.join(b[m:n])) for k,i,j,m,n in diff if k!='equal'];ratio=difflib.SequenceMatcher(None,a,b).ratio();path.write_text(json.dumps(dict(scene=sc['id'],expected=sc['narration'],actual=actual,similarity=ratio,edits=edits,segments=segments),indent=2));print(json.dumps(dict(scene=sc['id'],similarity=round(ratio,3),edits=edits)),flush=True)
