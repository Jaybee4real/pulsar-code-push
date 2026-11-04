const { Platform } = require("react-native");
const packageJson = require("./package.json");
const { getTargetingInfo, getReportExtras, getBundleKeyIds } = require("./targeting");

// React Native's default agent carries no usable platform detail — iOS sends a Darwin/CFNetwork
// string with no "iPhone OS x_y", and Android goes out through OkHttp as bare "okhttp/4.x". Both
// left the server guessing (Android was filed as "unknown" entirely, OS version was always empty),
// so state it explicitly instead.
function userAgent() {
  const os = Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS;
  const version = Platform.Version === undefined || Platform.Version === null ? "" : String(Platform.Version);
  return `Pulsar/${packageJson.version} (${os}${version ? " " + version : ""})`;
}

function hermesBytecodeVersion() {
  try {
    const version = global.HermesInternal?.getRuntimeProperties?.()?.["Bytecode Version"];
    return Number.isInteger(version) && version > 0 ? version : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  async request(verb, url, requestBody, callback) {
    if (typeof requestBody === "function") {
      callback = requestBody;
      requestBody = null;
    }

    // Scope the update-check to a specific device model / user id when the host app has set them.
    const { userId, deviceModel } = getTargetingInfo();
    if (verb === 0 && url.indexOf("update_check") !== -1) {
      const extra = [];
      if (deviceModel) extra.push("device_model=" + encodeURIComponent(deviceModel));
      if (userId) extra.push("user_id=" + encodeURIComponent(userId));
      if (extra.length) url += (url.indexOf("?") === -1 ? "?" : "&") + extra.join("&");
    }

    // Status reports carry the same identity. update_check only records a device when an update is
    // actually served, so without this the device/user targeting lists never fill on a quiet app.
    // The acquisition SDK hands us an already-stringified body here, so parse before augmenting.
    const extras = getReportExtras();
    if (url.indexOf("report_status") !== -1 && requestBody && (deviceModel || userId || extras)) {
      try {
        const parsed = typeof requestBody === "string" ? JSON.parse(requestBody) : requestBody;
        if (deviceModel && !parsed.device_model) parsed.device_model = deviceModel;
        if (userId && !parsed.user_id) parsed.user_id = userId;
        if (extras && parsed.status === "DeploymentFailed") {
          if (extras.failureReason) parsed.failure_reason = extras.failureReason;
          if (extras.failureStack) parsed.failure_stack = extras.failureStack;
        }
        requestBody = parsed;
      } catch (err) {
        // A body we can't parse is left exactly as-is — reporting must never fail over telemetry.
      }
    }

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent(),
      "X-CodePush-Plugin-Name": packageJson.name,
      "X-CodePush-Plugin-Version": packageJson.version,
      "X-CodePush-SDK-Version": "4.2.3"
    };

    const bundleKeyIds = getBundleKeyIds();
    if (verb === 0 && url.indexOf("update_check") !== -1 && bundleKeyIds.length) {
      headers["X-Pulsar-Bundle-Keys"] = bundleKeyIds.join(",");
    }

    if (verb === 0 && url.indexOf("update_check") !== -1) {
      const bytecodeVersion = hermesBytecodeVersion();
      if (bytecodeVersion) headers["X-Pulsar-Hermes-Bytecode"] = String(bytecodeVersion);
    }

    if (requestBody && typeof requestBody === "object") {
      requestBody = JSON.stringify(requestBody);
    }

    try {
      const response = await fetch(url, {
        method: getHttpMethodName(verb),
        headers: headers,
        body: requestBody
      });

      const statusCode = response.status;
      const body = await response.text();
      callback(null, { statusCode, body });
    } catch (err) {
      callback(err);
    }
  }
};

function getHttpMethodName(verb) {
  // Note: This should stay in sync with the enum definition in
  // https://github.com/microsoft/code-push/blob/master/sdk/script/acquisition-sdk.ts#L6
  return [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "DELETE",
    "TRACE",
    "OPTIONS",
    "CONNECT",
    "PATCH"
  ][verb];
}