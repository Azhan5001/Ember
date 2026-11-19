export function ratingSummary(response) {
 for(const stream of response?.streams||[]) {
  const text=[stream.name,stream.description,stream.title].filter(Boolean).join('\n');
  const score=Number(text.match(/\b(10(?:\.0)?|[0-9](?:\.\d+)?)\s*\/\s*10\b/)?.[1]);
  const match=text.match(/([\d,.]+)\s*([km])?\s*(?:votes|ratings)\b/i);
  const votes=match?Math.round(Number(match[1].replaceAll(',',''))*({k:1000,m:1000000}[match[2]?.toLowerCase()]||1)):0;
  let reviewUrl='';try{const u=new URL(stream.externalUrl);if(u.protocol==='https:'&&['imdb.com','www.imdb.com'].includes(u.hostname))reviewUrl=u.href}catch{}
  if(score>0&&score<=10)return {score,votes,reviewUrl};
 }
 return null;
}
