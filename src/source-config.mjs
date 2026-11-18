export const torrentioConfigure = "https://torrentio.strem.fun/configure";

function torrentioPath(addon) {
  try {
    const url = new URL(addon.base);
    if (url.origin === "https://torrentio.strem.fun")
      return decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {}
  return null;
}

export function configuredTorBoxKey(addon) {
  return torrentioPath(addon)?.match(/(?:^|[|/])torbox=([^|/]+)/i)?.[1] || "";
}

export function torrentioConfiguration(addon) {
  const path = torrentioPath(addon);
  if (path === null) return null;
  if (configuredTorBoxKey(addon)) return "torbox";
  return !path || path === "/lite" ? "plain" : "custom";
}

