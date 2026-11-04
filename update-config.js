const INSTALL_MODE_TOKENS = {
  immediate: "IMMEDIATE",
  "next-restart": "ON_NEXT_RESTART",
  "next-resume": "ON_NEXT_RESUME",
  "next-suspend": "ON_NEXT_SUSPEND",
};

const CONFIG_TOKENS = new Set(["silent", "mandatory", "forced", "no-pill", "nopill", ...Object.keys(INSTALL_MODE_TOKENS)]);

const CONFIG_LINE_PREFIX = /^(tags|config)\s*:/i;

const splitTokens = text => String(text).toLowerCase().split(/[\s,|]+/).filter(Boolean);

const isOnlyTokens = text => {
  const tokens = splitTokens(text);
  return tokens.length > 0 && tokens.every(token => CONFIG_TOKENS.has(token));
};

function parseUpdateConfig(description) {
  let notes = String(description || "");
  let configText = "";

  const lines = notes.split("\n");
  let lastIndex = lines.length - 1;
  while (lastIndex >= 0 && lines[lastIndex].trim() === "") lastIndex--;
  if (lastIndex >= 0 && CONFIG_LINE_PREFIX.test(lines[lastIndex].trim())) {
    configText += ` ${lines[lastIndex].trim().replace(CONFIG_LINE_PREFIX, "")}`;
    lines.splice(lastIndex, 1);
    notes = lines.join("\n");
  }

  const pipeIndex = notes.indexOf("|");
  if (pipeIndex !== -1 && isOnlyTokens(notes.slice(0, pipeIndex))) {
    configText += ` ${notes.slice(0, pipeIndex)}`;
    notes = notes.slice(pipeIndex + 1);
  }

  if (isOnlyTokens(notes)) {
    configText += ` ${notes}`;
    notes = "";
  }

  const tokens = splitTokens(configText);
  const installModeToken = tokens.find(token => INSTALL_MODE_TOKENS[token]);
  return {
    silent: tokens.includes("silent"),
    mandatory: tokens.includes("mandatory") || tokens.includes("forced"),
    noPill: tokens.includes("no-pill") || tokens.includes("nopill"),
    installMode: installModeToken ? INSTALL_MODE_TOKENS[installModeToken] : null,
    notes: notes.trim(),
  };
}

module.exports = {parseUpdateConfig};
