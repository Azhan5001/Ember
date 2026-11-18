const aliases={eng:'en',english:'en',jpn:'ja',jap:'ja',japanese:'ja',kor:'ko',korean:'ko',spa:'es',spanish:'es',fre:'fr',fra:'fr',french:'fr',ger:'de',deu:'de',german:'de',chi:'zh',zho:'zh',chinese:'zh',hin:'hi',hindi:'hi',urd:'ur',urdu:'ur',ara:'ar',arabic:'ar'};
export function audioLanguage(value='') {
 const text=String(value||'').trim().toLowerCase();
 if(!text)return '';
 const first=text.split(/[-_\s(\[]/)[0];
 if(aliases[first])return aliases[first];
 if(/^[a-z]{2}$/.test(first))return first;
 for(const [name,code] of Object.entries(aliases))if(new RegExp('(?:^|[^a-z])'+name+'(?:$|[^a-z])','i').test(text))return code;
 return '';
}
export function findAudioTrack(tracks=[],wanted='') {
 const code=audioLanguage(wanted);
 if(!code)return null;
 return tracks.find(t=>t.type==='audio' && [t.lang,t.language,t.title,t.name].some(x=>audioLanguage(x)===code)) || null;
}
export function labeledAudioSource(sources=[],wanted='',currentKey='') {
 const code=audioLanguage(wanted);
 if(!code)return null;
 const labels={en:/\b(?:eng|english)\b/i,ja:/\b(?:jpn|japanese)\b/i,ko:/\b(?:kor|korean)\b/i,es:/\b(?:spa|spanish)\b/i,fr:/\b(?:fra|fre|french)\b/i,de:/\b(?:deu|ger|german)\b/i};
 const pattern=labels[code];
 if(!pattern)return null;
 return sources.find(s=>s.key!==currentKey && pattern.test([s.name,s.label,s.behaviorHints?.filename].filter(Boolean).join(' ').replace(/subtitles?[^\n]*/ig,'')))||null;
}
