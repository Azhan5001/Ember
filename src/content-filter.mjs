const explicit=/^(?:adult(?: content)?|mature(?: content| themes)?|sex|sexual(?: content| violence)?|nudity|nude|erotic(?:a|ism)?|hentai|ecchi|porn(?:ography|ographic)?|softcore|hardcore|smut|explicit)$/i;
export const isAdultTag=value=>explicit.test(String(value||'').trim())||/\b(?:sexual intercourse|explicit sex|pornography|graphic nudity)\b/i.test(String(value||''));
export function isAdultItem(item={}){
 if(item.adult===true||item.isAdult===true||item.nsfw===true||item.isNsfw===true)return true;
 const tags=[...(item.genres||[]),...(item.keywords||[]),...(item.tags||[]),...(item.categories||[])].map(v=>typeof v==='string'?v:v?.name);
 if(tags.some(isAdultTag))return true;
 return /^(?:18\+?|TV-MA|NC-17|R18\+?|X|XXX)$/i.test(String(item.certification||item.contentRating||item.app_extras?.certification||'').trim());
}
