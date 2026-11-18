import React, { createContext, useContext, useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { Addon, Item, alternateArtwork, artwork } from './api';
import { artworkCandidates } from './artwork-core.mjs';
export const ArtworkProviders = createContext<Addon[]>([]);
const failed = new Map<string, number>();
export default function Artwork({ item, kind = 'poster', preferred, className = '', loading = 'lazy', ...props }: {item:Item; kind?:string; preferred?:string; className?:string; loading?:'lazy'|'eager'; [key:string]:any}) {
  const addons = useContext(ArtworkProviders);
  const providerKey=addons.filter(a=>a.enabled).map(a=>a.base).join("|");
  const identity = item.type+':'+item.id+':'+kind+':'+preferred+':'+item[kind];
  const [extras,setExtras] = useState<{key:string; urls:string[]}>({key:identity,urls:[]});
  const [revision,update] = useState(0);
  const [looked,setLooked] = useState('');
  const urls = [...new Set([...artworkCandidates(item,kind,preferred), ...(extras.key === identity ? extras.urls : [])])];
  const src = urls.find(u => Date.now()-(failed.get(u) || 0)>300000);
  useEffect(() => {
    if (src || looked === identity) return;
    let current = true;
    setLooked(identity);
    alternateArtwork(addons,item,kind).then(urls => { if(current) setExtras({key:identity,urls}); });
    return () => { current=false; };
  },[identity,src,providerKey,revision]);
  return src ? <img {...props} className={className} src={artwork(src)} alt="" loading={loading} onError={() => { failed.set(src,Date.now()); while(failed.size>800) failed.delete(failed.keys().next().value!); update(n=>n+1); }} /> : <span {...props} className={'artplaceholder '+className} aria-label={'Artwork unavailable for '+item.name}><Flame size={26}/></span>;
}
