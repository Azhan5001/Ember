export function artworkCandidates(item = {}, kind = 'poster', preferred) {
  const raw = [preferred, item[kind], ...(item[kind + 's'] || []), ...(item.artwork?.[kind] || [])];
  const values = kind === 'background'
    ? [...raw.map(u => typeof u === 'string' ? u.replace(/(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/.*)/, '$1original$2') : u), ...raw]
    : raw;
  // Only exact identifiers: never guess a different title from its name.
  if (/^tt\d+$/.test(item.id) && ['poster','background','logo'].includes(kind)) values.push(`https://images.metahub.space/${kind}/medium/${item.id}/img`);
  if (kind === 'background') values.push(item.poster);
  if (kind === 'poster' && item.poster_path?.startsWith('/')) values.push('https://image.tmdb.org/t/p/w500' + item.poster_path);
  return [...new Set(values.filter(u => typeof u === 'string' && /^(https?:|data:image\/)/.test(u)))];
}
