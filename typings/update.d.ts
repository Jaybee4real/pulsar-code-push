import * as React from "react";
import CodePush from "./react-native-code-push";

export type PulsarUpdateStatus =
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
    | "installed"
    | "failed"
    | "upToDate";

export interface PulsarUpdateOptions {
    deploymentKey?: string | null;
    serverUrl?: string | null;
    /**
     * Install mode for optional updates. Defaults to InstallMode.ON_NEXT_RESTART.
     * A release-description token (immediate, next-restart, next-resume, next-suspend) overrides it.
     */
    installMode?: CodePush.InstallMode;
    /**
     * Install mode for mandatory updates. Defaults to InstallMode.IMMEDIATE.
     */
    mandatoryInstallMode?: CodePush.InstallMode;
    minimumBackgroundDuration?: number;
    /**
     * Check for updates in __DEV__ builds too. Defaults to false.
     */
    checkInDev?: boolean;
}

export interface PulsarUpdateInfo {
    label: string;
    /**
     * Release notes with the config tokens stripped.
     */
    description: string;
    isMandatory: boolean;
    packageSize: number;
    silent: boolean;
    noPill: boolean;
    installMode: CodePush.InstallMode;
}

export interface PulsarUpdateProgress {
    receivedBytes: number;
    totalBytes: number;
    percent: number;
    /**
     * False until the first byte is reported. Older iOS binaries report nothing until the
     * download completes, so show an indeterminate state rather than treating it as stuck.
     */
    hasRealProgress: boolean;
}

export interface PulsarUpdateState {
    status: PulsarUpdateStatus;
    update: PulsarUpdateInfo | null;
    progress: PulsarUpdateProgress;
    error: string | null;
    /**
     * True after 30s with no bytes, or 20s since the last byte. A hint only: the download is never failed by a timer.
     */
    slow: boolean;
    dismissed: boolean;
}

export interface PulsarUpdate extends PulsarUpdateState {
    install(): void;
    /**
     * Hides an optional update (or the installed/failed panel) for the rest of the session. No-op for a mandatory update.
     */
    dismiss(): void;
    retry(): void;
    restart(): void;
}

export interface PulsarUpdateConfig {
    silent: boolean;
    mandatory: boolean;
    noPill: boolean;
    installMode: "IMMEDIATE" | "ON_NEXT_RESTART" | "ON_NEXT_RESUME" | "ON_NEXT_SUSPEND" | null;
    notes: string;
}

export interface PulsarUpdateTheme {
    primary?: string;
    background?: string;
    text?: string;
    mutedText?: string;
    danger?: string;
}

export interface PulsarUpdateLabels {
    availableTitle?: string;
    mandatoryTitle?: string;
    availableMessage?: string;
    mandatoryMessage?: string;
    notesTitle?: string;
    updateNow?: string;
    later?: string;
    downloadingTitle?: string;
    installingTitle?: string;
    preparing?: string;
    slow?: string;
    installedTitle?: string;
    installedMessage?: string;
    restartNow?: string;
    failedTitle?: string;
    failedMessage?: string;
    retry?: string;
    close?: string;
}

export interface PulsarUpdateSheetProps extends PulsarUpdateOptions {
    theme?: PulsarUpdateTheme;
    labels?: PulsarUpdateLabels;
    /**
     * Replaces the built-in panels while keeping the overlay and slide-up animation.
     */
    renderContent?: (update: PulsarUpdate) => React.ReactNode;
}

export function usePulsarUpdate(options?: PulsarUpdateOptions): PulsarUpdate;

export function parseUpdateConfig(description?: string | null): PulsarUpdateConfig;

export const PulsarUpdateSheet: React.FC<PulsarUpdateSheetProps>;
