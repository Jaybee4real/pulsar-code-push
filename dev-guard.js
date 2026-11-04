let allowedInDev = false;

const runningInDev = () => typeof __DEV__ !== "undefined" && __DEV__ === true;

function allowUpdatesInDev(allowed = true) {
  allowedInDev = Boolean(allowed);
}

function devUpdatesBlocked() {
  return runningInDev() && !allowedInDev;
}

module.exports = {allowUpdatesInDev, devUpdatesBlocked};
