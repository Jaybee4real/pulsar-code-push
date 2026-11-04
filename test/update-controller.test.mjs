import assert from 'node:assert';
import {test} from 'node:test';
import updateController from '../update-controller.js';

const {createUpdateController} = updateController;

const SyncStatus = {
  UP_TO_DATE: 0,
  UPDATE_INSTALLED: 1,
  UPDATE_IGNORED: 2,
  UNKNOWN_ERROR: 3,
  SYNC_IN_PROGRESS: 4,
  CHECKING_FOR_UPDATE: 5,
  AWAITING_USER_ACTION: 6,
  DOWNLOADING_PACKAGE: 7,
  INSTALLING_UPDATE: 8,
};
const InstallMode = {IMMEDIATE: 0, ON_NEXT_RESTART: 1, ON_NEXT_RESUME: 2, ON_NEXT_SUSPEND: 3};

const flush = () => new Promise(resolve => setImmediate(resolve));

function createMockCodePush(remotePackage) {
  const calls = {checks: [], syncs: [], restarts: [], devOptIns: []};
  return {
    InstallMode,
    SyncStatus,
    calls,
    checkForUpdate: async (...args) => {
      calls.checks.push(args);
      if (remotePackage instanceof Error) throw remotePackage;
      return remotePackage;
    },
    sync: (options, onStatus, onProgress) =>
      new Promise((resolve, reject) => {
        calls.syncs.push({options, onStatus, onProgress, resolve, reject});
      }),
    restartApp: onlyIfPending => calls.restarts.push(onlyIfPending),
    allowUpdatesInDev: allowed => calls.devOptIns.push(allowed),
  };
}

function createFakeTimers() {
  let now = 0;
  let nextTimerId = 1;
  let pending = [];
  return {
    setTimeout(callback, delay) {
      const timerId = nextTimerId++;
      pending.push({timerId, callback, dueAt: now + delay});
      return timerId;
    },
    clearTimeout(timerId) {
      pending = pending.filter(timer => timer.timerId !== timerId);
    },
    advance(milliseconds) {
      now += milliseconds;
      const due = pending.filter(timer => timer.dueAt <= now);
      pending = pending.filter(timer => timer.dueAt > now);
      due.forEach(timer => timer.callback());
    },
  };
}

function setup(remotePackage, options = {}) {
  const codePush = createMockCodePush(remotePackage);
  const timers = createFakeTimers();
  const controller = createUpdateController({codePush, getOptions: () => options, timers});
  return {codePush, timers, controller};
}

const optionalPackage = {label: 'v7', description: "What's new", isMandatory: false, packageSize: 2048, failedInstall: false};

test('an update the device already rolled back is never offered', async () => {
  const {codePush, controller} = setup({...optionalPackage, failedInstall: true});
  await controller.check();
  assert.strictEqual(controller.getState().status, 'upToDate');
  assert.strictEqual(controller.getState().update, null);
  assert.strictEqual(codePush.calls.syncs.length, 0);
});

test('no update means up to date', async () => {
  const {controller} = setup(null);
  await controller.check();
  assert.strictEqual(controller.getState().status, 'upToDate');
});

test('checks pass the deployment key and server url, and sync uses them too', async () => {
  const {codePush, controller} = setup(optionalPackage, {deploymentKey: 'key-1', serverUrl: 'https://api.usepulsar.dev', minimumBackgroundDuration: 60});
  await controller.check();
  assert.deepStrictEqual(codePush.calls.checks[0], ['key-1', null, 'https://api.usepulsar.dev']);
  const state = controller.getState();
  assert.strictEqual(state.status, 'available');
  assert.deepStrictEqual(
    {label: state.update.label, description: state.update.description, isMandatory: state.update.isMandatory, packageSize: state.update.packageSize},
    {label: 'v7', description: "What's new", isMandatory: false, packageSize: 2048},
  );
  controller.install();
  assert.deepStrictEqual(codePush.calls.syncs[0].options, {
    updateDialog: false,
    deploymentKey: 'key-1',
    serverUrl: 'https://api.usepulsar.dev',
    installMode: InstallMode.ON_NEXT_RESTART,
    mandatoryInstallMode: InstallMode.ON_NEXT_RESTART,
    minimumBackgroundDuration: 60,
  });
});

test('an optional update can be dismissed and is not offered again this session', async () => {
  const {codePush, controller} = setup(optionalPackage);
  await controller.check();
  controller.dismiss();
  assert.strictEqual(controller.getState().status, 'idle');
  assert.strictEqual(controller.getState().dismissed, true);
  await controller.check();
  controller.onAppStateChange('background');
  controller.onAppStateChange('active');
  await flush();
  assert.strictEqual(codePush.calls.checks.length, 1);
});

test('a mandatory update cannot be dismissed, from the server flag or a token', async () => {
  for (const remotePackage of [{...optionalPackage, isMandatory: true}, {...optionalPackage, description: 'mandatory | Security fix'}]) {
    const {codePush, controller} = setup(remotePackage);
    await controller.check();
    controller.dismiss();
    const state = controller.getState();
    assert.strictEqual(state.status, 'available');
    assert.strictEqual(state.dismissed, false);
    assert.strictEqual(state.update.isMandatory, true);
    controller.install();
    assert.strictEqual(codePush.calls.syncs[0].options.installMode, InstallMode.IMMEDIATE);
    assert.strictEqual(codePush.calls.syncs[0].options.mandatoryInstallMode, InstallMode.IMMEDIATE);
  }
  const {controller: tokenModeController, codePush: tokenModeCodePush} = setup({...optionalPackage, description: 'forced, next-restart | Fix'});
  await tokenModeController.check();
  tokenModeController.install();
  assert.strictEqual(tokenModeCodePush.calls.syncs[0].options.installMode, InstallMode.ON_NEXT_RESTART);
});

test('a silent update downloads and installs with no prompt, and fails quietly', async () => {
  const {codePush, controller} = setup({...optionalPackage, description: 'silent'});
  await controller.check();
  assert.strictEqual(codePush.calls.syncs.length, 1);
  assert.strictEqual(controller.getState().status, 'downloading');
  assert.strictEqual(controller.getState().update.silent, true);
  codePush.calls.syncs[0].reject(new Error('network down'));
  await flush();
  assert.strictEqual(controller.getState().status, 'idle');
  assert.strictEqual(controller.getState().error, 'network down');

  const installedRun = setup({...optionalPackage, description: 'silent'});
  await installedRun.controller.check();
  installedRun.codePush.calls.syncs[0].onStatus(SyncStatus.UPDATE_INSTALLED);
  assert.strictEqual(installedRun.controller.getState().status, 'installed');
});

test('a stalled download is never failed by a timer, only flagged slow', async () => {
  const {codePush, timers, controller} = setup(optionalPackage);
  await controller.check();
  controller.install();
  const sync = codePush.calls.syncs[0];
  sync.onStatus(SyncStatus.DOWNLOADING_PACKAGE);
  assert.strictEqual(controller.getState().progress.hasRealProgress, false);
  timers.advance(29999);
  assert.strictEqual(controller.getState().slow, false);
  timers.advance(1);
  assert.strictEqual(controller.getState().slow, true);
  timers.advance(10 * 60 * 1000);
  assert.strictEqual(controller.getState().status, 'downloading');
  assert.strictEqual(controller.getState().error, null);
});

test('real progress clears slow, and slow returns 20s after the last byte', async () => {
  const {codePush, timers, controller} = setup(optionalPackage);
  await controller.check();
  controller.install();
  const sync = codePush.calls.syncs[0];
  sync.onProgress({receivedBytes: 0, totalBytes: 4096});
  assert.strictEqual(controller.getState().progress.hasRealProgress, false);
  timers.advance(31000);
  assert.strictEqual(controller.getState().slow, true);
  sync.onProgress({receivedBytes: 1024, totalBytes: 4096});
  assert.deepStrictEqual(controller.getState().progress, {receivedBytes: 1024, totalBytes: 4096, percent: 25, hasRealProgress: true});
  assert.strictEqual(controller.getState().slow, false);
  timers.advance(19999);
  assert.strictEqual(controller.getState().slow, false);
  timers.advance(1);
  assert.strictEqual(controller.getState().slow, true);
  assert.strictEqual(controller.getState().status, 'downloading');
});

test('failure comes from UNKNOWN_ERROR or a rejected sync, and retry starts a fresh sync', async () => {
  const {codePush, controller} = setup(optionalPackage);
  await controller.check();
  controller.install();
  codePush.calls.syncs[0].onStatus(SyncStatus.UNKNOWN_ERROR);
  assert.strictEqual(controller.getState().status, 'failed');
  assert.ok(controller.getState().error);

  controller.retry();
  assert.strictEqual(controller.getState().status, 'downloading');
  assert.strictEqual(controller.getState().error, null);
  assert.strictEqual(codePush.calls.syncs.length, 2);
  codePush.calls.syncs[0].onStatus(SyncStatus.UPDATE_INSTALLED);
  assert.strictEqual(controller.getState().status, 'downloading', 'callbacks from an earlier run are ignored');

  codePush.calls.syncs[1].reject(new Error('Hash mismatch'));
  await flush();
  assert.strictEqual(controller.getState().status, 'failed');
  assert.strictEqual(controller.getState().error, 'Hash mismatch');

  controller.dismiss();
  assert.strictEqual(controller.getState().status, 'idle');
});

test('a sync already running elsewhere is reported as a failure, not a hang', async () => {
  const {codePush, controller} = setup(optionalPackage);
  await controller.check();
  controller.install();
  codePush.calls.syncs[0].resolve(SyncStatus.SYNC_IN_PROGRESS);
  await flush();
  assert.strictEqual(controller.getState().status, 'failed');
});

test('a next-restart install ends in installed, and restart reloads the app', async () => {
  const {codePush, controller} = setup({...optionalPackage, description: 'next-restart | Fixes'});
  await controller.check();
  controller.install();
  const sync = codePush.calls.syncs[0];
  sync.onStatus(SyncStatus.DOWNLOADING_PACKAGE);
  sync.onProgress({receivedBytes: 4096, totalBytes: 4096});
  sync.onStatus(SyncStatus.INSTALLING_UPDATE);
  assert.strictEqual(controller.getState().status, 'installing');
  sync.onStatus(SyncStatus.UPDATE_INSTALLED);
  sync.resolve(SyncStatus.UPDATE_INSTALLED);
  await flush();
  assert.strictEqual(controller.getState().status, 'installed');
  controller.dismiss();
  assert.strictEqual(controller.getState().status, 'installed');
  assert.strictEqual(controller.getState().dismissed, true);
  controller.restart();
  assert.deepStrictEqual(codePush.calls.restarts, [false]);
});

test('checks are skipped in dev unless checkInDev, and never overlap', async () => {
  const devOnly = setup(optionalPackage, {isDev: true});
  await devOnly.controller.check();
  assert.strictEqual(devOnly.codePush.calls.checks.length, 0);
  assert.deepStrictEqual(devOnly.codePush.calls.devOptIns, [], 'dev builds stay opted out by default');

  const devAllowed = setup(optionalPackage, {isDev: true, checkInDev: true});
  const firstCheck = devAllowed.controller.check();
  const overlappingCheck = devAllowed.controller.check();
  await Promise.all([firstCheck, overlappingCheck]);
  assert.strictEqual(devAllowed.codePush.calls.checks.length, 1);
  assert.ok(devAllowed.codePush.calls.devOptIns.includes(true), 'checkInDev lifts the SDK-level dev guard');
});

test('returning to the foreground checks again; staying active does not', async () => {
  const {codePush, controller} = setup(null);
  await controller.check();
  controller.onAppStateChange('active');
  await flush();
  assert.strictEqual(codePush.calls.checks.length, 1);
  controller.onAppStateChange('inactive');
  controller.onAppStateChange('active');
  await flush();
  assert.strictEqual(codePush.calls.checks.length, 2);
});

test('a failed check goes back to idle instead of showing a failure', async () => {
  const {controller} = setup(new Error('offline'));
  await controller.check();
  assert.strictEqual(controller.getState().status, 'idle');
  assert.strictEqual(controller.getState().error, 'offline');
});

test('subscribers receive every state change', async () => {
  const {controller} = setup(optionalPackage);
  const seenStatuses = [];
  const unsubscribe = controller.subscribe(state => seenStatuses.push(state.status));
  await controller.check();
  unsubscribe();
  controller.dismiss();
  assert.deepStrictEqual(seenStatuses, ['checking', 'available']);
});
