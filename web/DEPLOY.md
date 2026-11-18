# Ember Web on Cloudflare Pages

## Upload the prebuilt site

1. Create or sign in to a free Cloudflare account at https://dash.cloudflare.com/.
2. Open **Workers & Pages → Create application** select **Pages**, then choose **Drag and drop your files**.
3. Name the project, upload `Ember-Web-0.5.5-Cloudflare-Pages.zip`, and select **Deploy site**. Open the resulting `https://<project-name>.pages.dev` address.

Upload the deployable ZIP. It has `index.html`, `_worker.js`, and `_headers` at its root. The worker delegates ordinary requests to Pages assets and never carries video bytes. Static files use Pages hosting. TorBox lookups use the Workers Free quota. Cloudflare's free hosting does not pay for an existing TorBox subscription.

## Set up playback

- Open **Addons** in Ember. You can paste a configured Torrentio link from https://torrentio.strem.fun/configure.
- If Torrentio gives you torrent hashes, enter your key in **Addons → TorBox playback → Save key**. The key comes from TorBox Settings. The separate key field uses browser local storage and sends the key to this site's lookup endpoint only when needed. A configured Torrentio link can already contain the key and is stored with your addon profile.
- Open a title and choose **Stream via TorBox** in **Sources**. This can add a cached release to your TorBox account and returns a signed video URL. If a release is uncached, choose **Prepare this release in TorBox** and try the source again once it is ready. The browser streams from the provider.
- **Open stream** also accepts a direct HTTPS media link. H.264/AAC MP4 is a good first choice. Playback and track selection depend on browser support and provider access rules. HLS with alternate audio and file audio tracks exposed by the browser can be selected inside Ember. The web build has no desktop decoder, local torrent engine, or OS link registration.

## Build from source

Use Node.js 22.12 or later and Python 3. From the source directory run:

```bash
npm ci
npm run build
python3 web/package.py
```

The deployable ZIP appears one directory above the source directory. Local Vite preview serves the frontend. The TorBox lookup needs a Pages runtime such as `wrangler pages dev` with the deployable ZIP extracted to its own directory.

Official references
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/workers/platform/limits/
- https://api-docs.torbox.app/
