"""Refresh TVmaze Korean catalog, CC BY-SA 4.0. Save partial milestones atomically."""
import concurrent.futures,json,time,urllib.request,urllib.error,pathlib,os,threading
root=pathlib.Path(__file__).resolve().parents[1]
cache=pathlib.Path(os.environ.get('EMBER_METADATA_CACHE',str(pathlib.Path.home()/'.cache/ember/tvmaze')));cache.mkdir(parents=True,exist_ok=True)
lock=threading.Lock();last=[0.]
def page(n):
 p=cache/f'{n}.json'
 if p.exists():return json.loads(p.read_text())
 for attempt in range(4):
  with lock:
   delay=.6-(time.monotonic()-last[0])
   if delay>0:time.sleep(delay)
   last[0]=time.monotonic()
  try:
   with urllib.request.urlopen(f'https://api.tvmaze.com/shows?page={n}',timeout=20) as r:data=json.load(r)
   p.write_text(json.dumps(data));return data
  except urllib.error.HTTPError as e:
   if e.code==404:return None
   if e.code not in [429,500,502,503,504]:raise
  except TimeoutError:pass
  time.sleep(2+attempt*2)
 raise RuntimeError(f'Cannot fetch page {n}')
def collect():
 out={}
 for p in cache.glob('*.json'):
  for s in json.loads(p.read_text()):
   country=(s.get('network') or s.get('webChannel') or {}).get('country') or {};imdb=s.get('externals',{}).get('imdb')
   if imdb and (s.get('language')=='Korean' or country.get('code')=='KR') and s.get('type')=='Scripted':
    out[imdb]={'id':imdb,'type':'series','name':s['name'],'tvmaze_id':s['id'],'genres':s['genres'],'categories':['K-drama'],'country':country.get('name','South Korea'),'language':s['language'],'released':s.get('premiered'),'year':(s.get('premiered') or '')[:4],'poster':(s.get('image') or {}).get('medium'),'rating':s['rating']['average'],'ratingProvider':'TVmaze','status':s['status'],'metadataSource':s['url']}
 path=root/'public/data/korean-catalog.json';temp=path.with_suffix('.tmp');temp.write_text(json.dumps(sorted(out.values(),key=lambda x:x['name']),separators=(',',':'),ensure_ascii=False));temp.replace(path)
 return len(out)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for start in range(0,600,24):
  rows=list(pool.map(page,range(start,start+24)))
  print('Pages',start,'titles',collect(),flush=True)
  if any(row is None for row in rows):break
print('Complete',collect(),flush=True)
