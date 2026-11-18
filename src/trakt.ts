export async function traktRequest(
  clientId: string,
  path: string,
  method = "GET",
  body?: any,
  token?: string,
) {
  const headers: any = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
  };
  if (token) headers.Authorization = "Bearer " + token;
  const args = {
    url: "https://api.trakt.tv" + path,
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };
  const r = window.ember
    ? await window.ember.trakt(args)
    : await fetch(args.url, args).then(async (r) => ({
        status: r.status,
        text: await r.text(),
      }));
  if (r.status < 200 || r.status >= 300)
    throw Object.assign(Error("Trakt HTTP " + r.status), { status: r.status });
  return r.text ? JSON.parse(r.text) : {};
}
export async function recommendations(id: string, token: string, type: string) {
  const data = await traktRequest(
    id,
    "/recommendations/" + (type === "series" ? "shows" : "movies"),
    "GET",
    undefined,
    token,
  );
  return data
    .filter((x: any) => x.ids?.imdb)
    .map((x: any) => ({
      id: x.ids.imdb,
      type,
      name: x.title,
      year: String(x.year || ""),
    }));
}
