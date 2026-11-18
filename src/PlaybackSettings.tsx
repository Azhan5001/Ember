import React from "react";
export default function PlaybackSettings({
  settings: s,
  onSetting,
  compact = false,
}: any) {
  const auto = (key: string, value: boolean) =>
    onSetting({ [key]: value, ...(value ? { smartSkip: "manual" } : {}) });
  return (
    <div className={"playbacksettings " + (compact ? "compact" : "")}>
      <h3>Smart Skip</h3>
      <label className="settingline">
        Show intro, recap and outro markers
        <input
          type="checkbox"
          checked={s.smartSkip !== "off"}
          onChange={(e) =>
            onSetting({ smartSkip: e.target.checked ? "manual" : "off" })
          }
        />
      </label>
      <label className="settingline">
        Automatically skip intros
        <input
          type="checkbox"
          checked={s.autoSkipIntro}
          onChange={(e) => auto("autoSkipIntro", e.target.checked)}
        />
      </label>
      <label className="settingline">
        Automatically skip recaps
        <input
          type="checkbox"
          checked={s.autoSkipRecap}
          onChange={(e) => auto("autoSkipRecap", e.target.checked)}
        />
      </label>
      <label className="settingline">
        Next episode when outro begins
        <input
          type="checkbox"
          checked={s.autoNextOutro}
          onChange={(e) => auto("autoNextOutro", e.target.checked)}
        />
      </label>
      <label>
        Timing source
        <select
          aria-label="Skip timing policy"
          value={s.skipTrust || "community"}
          onChange={(e) => onSetting({ skipTrust: e.target.value })}
        >
          <option value="community">Community timings (automatic)</option>
          <option value="verified">Only timings I verified</option>
        </select>
      </label>
      <small>
        Community timings work without manual verification. They can differ
        between releases.
      </small>
    </div>
  );
}
