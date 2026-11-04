// Optional targeting identifiers the host app can set (e.g. at login). They are appended to the
// update-check request so the server can scope a release to specific device models / user ids.
// Shared singleton: the fetch adapter reads it, CodePush.setTargetingInfo writes it.
let info = { userId: null, deviceModel: null };

function setTargetingInfo(next) {
  if (!next) return info;
  if (next.userId !== undefined) info.userId = next.userId == null ? null : String(next.userId);
  if (next.deviceModel !== undefined) info.deviceModel = next.deviceModel == null ? null : String(next.deviceModel);
  return info;
}

function getTargetingInfo() {
  return info;
}

let reportExtras = null;

function setReportExtras(next) {
  reportExtras = next || null;
}

function getReportExtras() {
  return reportExtras;
}

let bundleKeyIds = [];

function setBundleKeyIds(next) {
  bundleKeyIds = Array.isArray(next) ? next.filter((kid) => typeof kid === "string" && /^[0-9a-f]{16}$/.test(kid)) : [];
}

function getBundleKeyIds() {
  return bundleKeyIds;
}

module.exports = { setTargetingInfo, getTargetingInfo, setReportExtras, getReportExtras, setBundleKeyIds, getBundleKeyIds };
