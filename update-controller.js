const {parseUpdateConfig} = require("./update-config");

const SLOW_BEFORE_FIRST_BYTE_MS = 30000;
const SLOW_BETWEEN_BYTES_MS = 20000;

const EMPTY_PROGRESS = {receivedBytes: 0, totalBytes: 0, percent: 0, hasRealProgress: false};

const INITIAL_STATE = {
  status: "idle",
  update: null,
  progress: EMPTY_PROGRESS,
  error: null,
  slow: false,
  dismissed: false,
};

const errorMessage = error => (error && (error.message || String(error))) || "The update could not be installed.";

function createUpdateController({codePush, getOptions, timers = {setTimeout, clearTimeout}}) {
  let state = INITIAL_STATE;
  let listeners = [];
  let pendingUpdate = null;
  let slowTimer = null;
  let syncRun = 0;
  let lastAppState = "active";

  const setState = patch => {
    state = {...state, ...patch};
    listeners.forEach(listener => listener(state));
  };

  const clearSlowTimer = () => {
    if (slowTimer !== null) timers.clearTimeout(slowTimer);
    slowTimer = null;
  };

  const armSlowTimer = delay => {
    clearSlowTimer();
    slowTimer = timers.setTimeout(() => {
      slowTimer = null;
      if (state.status === "downloading") setState({slow: true});
    }, delay);
  };

  const options = () => (getOptions && getOptions()) || {};

  const resolveInstallMode = (config, isMandatory) => {
    const {InstallMode} = codePush;
    if (config.installMode) return InstallMode[config.installMode];
    const {installMode = InstallMode.ON_NEXT_RESTART, mandatoryInstallMode = InstallMode.IMMEDIATE} = options();
    return isMandatory ? mandatoryInstallMode : installMode;
  };

  const fail = (run, error) => {
    if (run !== syncRun || state.status === "installed") return;
    clearSlowTimer();
    if (pendingUpdate && pendingUpdate.silent) {
      setState({status: "idle", error: errorMessage(error), slow: false});
      return;
    }
    setState({status: "failed", error: errorMessage(error), slow: false});
  };

  const handleSyncStatus = (run, syncStatus) => {
    if (run !== syncRun) return;
    const {SyncStatus} = codePush;
    switch (syncStatus) {
      case SyncStatus.DOWNLOADING_PACKAGE:
        setState({status: "downloading"});
        break;
      case SyncStatus.INSTALLING_UPDATE:
        clearSlowTimer();
        setState({status: "installing", slow: false});
        break;
      case SyncStatus.UPDATE_INSTALLED:
        clearSlowTimer();
        setState({status: "installed", slow: false, error: null});
        break;
      case SyncStatus.UP_TO_DATE:
      case SyncStatus.UPDATE_IGNORED:
        clearSlowTimer();
        setState({status: "upToDate", update: null, slow: false});
        break;
      case SyncStatus.SYNC_IN_PROGRESS:
        fail(run, new Error("Another update is already in progress."));
        break;
      case SyncStatus.UNKNOWN_ERROR:
        fail(run, null);
        break;
    }
  };

  const handleProgress = (run, downloadProgress) => {
    if (run !== syncRun || state.status !== "downloading") return;
    const receivedBytes = Number(downloadProgress && downloadProgress.receivedBytes) || 0;
    const totalBytes = Number(downloadProgress && downloadProgress.totalBytes) || 0;
    if (receivedBytes <= 0) return;
    const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
    armSlowTimer(SLOW_BETWEEN_BYTES_MS);
    setState({progress: {receivedBytes, totalBytes, percent, hasRealProgress: true}, slow: false});
  };

  const install = () => {
    if (!pendingUpdate || (state.status !== "available" && state.status !== "failed")) return;
    syncRun += 1;
    const run = syncRun;
    const {deploymentKey = null, serverUrl = null, minimumBackgroundDuration = 0} = options();
    const installMode = pendingUpdate.installMode;
    setState({status: "downloading", progress: EMPTY_PROGRESS, error: null, slow: false});
    armSlowTimer(SLOW_BEFORE_FIRST_BYTE_MS);
    let syncPromise;
    try {
      syncPromise = codePush.sync(
        {
          updateDialog: false,
          deploymentKey,
          serverUrl,
          installMode,
          mandatoryInstallMode: installMode,
          minimumBackgroundDuration,
        },
        syncStatus => handleSyncStatus(run, syncStatus),
        downloadProgress => handleProgress(run, downloadProgress),
      );
    } catch (error) {
      fail(run, error);
      return;
    }
    Promise.resolve(syncPromise).then(
      syncStatus => handleSyncStatus(run, syncStatus),
      error => fail(run, error),
    );
  };

  const check = async () => {
    const {checkInDev = false, isDev = false, deploymentKey = null, serverUrl = null} = options();
    if (!codePush || (isDev && !checkInDev) || state.dismissed) return;
    if (isDev && checkInDev) codePush.allowUpdatesInDev?.(true);
    if (state.status !== "idle" && state.status !== "upToDate") return;
    setState({status: "checking", error: null});
    let remotePackage;
    try {
      remotePackage = await codePush.checkForUpdate(deploymentKey, null, serverUrl);
    } catch (error) {
      setState({status: "idle", error: errorMessage(error)});
      return;
    }
    if (!remotePackage || remotePackage.failedInstall) {
      setState({status: "upToDate", update: null});
      return;
    }
    const config = parseUpdateConfig(remotePackage.description);
    const isMandatory = Boolean(remotePackage.isMandatory || config.mandatory);
    pendingUpdate = {
      label: remotePackage.label,
      description: config.notes,
      isMandatory,
      packageSize: remotePackage.packageSize || 0,
      silent: config.silent,
      noPill: config.noPill,
      installMode: resolveInstallMode(config, isMandatory),
    };
    setState({status: "available", update: pendingUpdate});
    if (config.silent) install();
  };

  const dismiss = () => {
    const optionalAvailable = state.status === "available" && !pendingUpdate.isMandatory;
    if (optionalAvailable || state.status === "failed") setState({dismissed: true, status: "idle"});
    else if (state.status === "installed") setState({dismissed: true});
  };

  const retry = () => {
    if (state.status === "failed") install();
  };

  const restart = () => codePush && codePush.restartApp(false);

  const onAppStateChange = nextAppState => {
    const wasInBackground = lastAppState === "background" || lastAppState === "inactive";
    lastAppState = nextAppState;
    if (wasInBackground && nextAppState === "active") check();
  };

  const subscribe = listener => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(existing => existing !== listener);
    };
  };

  const dispose = () => {
    clearSlowTimer();
    listeners = [];
  };

  return {
    getState: () => state,
    subscribe,
    check,
    install,
    dismiss,
    retry,
    restart,
    onAppStateChange,
    dispose,
  };
}

module.exports = {createUpdateController};
