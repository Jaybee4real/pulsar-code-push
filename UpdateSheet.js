const React = require("react");
const {Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View} = require("react-native");

const DEFAULT_THEME = {
  primary: "#4F46E5",
  background: "#FFFFFF",
  text: "#111827",
  mutedText: "#6B7280",
  danger: "#DC2626",
};

const DEFAULT_LABELS = {
  availableTitle: "Update available",
  mandatoryTitle: "Update required",
  availableMessage: "A new version of the app is ready to download.",
  mandatoryMessage: "This update is required to keep using the app.",
  notesTitle: "What's new",
  updateNow: "Update now",
  later: "Later",
  downloadingTitle: "Downloading update",
  installingTitle: "Installing update",
  preparing: "Preparing download…",
  slow: "This is taking longer than usual. It will finish on its own — keep the app open.",
  installedTitle: "Update ready",
  installedMessage: "The update applies the next time you restart the app.",
  restartNow: "Restart now",
  failedTitle: "Update failed",
  failedMessage: "The update could not be installed.",
  retry: "Retry",
  close: "Close",
};

const VISIBLE_STATUSES = ["available", "downloading", "installing", "installed", "failed"];
const SHEET_OFFSET = 600;

const formatBytes = bytes => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

function SheetButton({label, onPress, filled, theme, styles}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        filled ? {backgroundColor: theme.primary} : {borderColor: theme.mutedText},
        pressed && styles.buttonPressed,
      ]}>
      <Text style={[styles.buttonText, {color: filled ? theme.background : theme.text}]}>{label}</Text>
    </Pressable>
  );
}

function ProgressBar({progress, installing, theme, styles}) {
  const [trackWidth, setTrackWidth] = React.useState(0);
  const sweep = React.useRef(new Animated.Value(0)).current;
  const indeterminate = !installing && !progress.hasRealProgress;

  React.useEffect(() => {
    if (!indeterminate) return undefined;
    const loop = Animated.loop(
      Animated.timing(sweep, {toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, sweep]);

  const fillWidth = installing ? "100%" : `${progress.percent}%`;
  return (
    <View style={styles.track} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}>
      <View style={[StyleSheet.absoluteFill, styles.trackBackground, {backgroundColor: theme.mutedText}]} />
      {indeterminate ? (
        <Animated.View
          style={[
            styles.sweep,
            {
              backgroundColor: theme.primary,
              transform: [
                {translateX: sweep.interpolate({inputRange: [0, 1], outputRange: [-trackWidth * 0.4, trackWidth]})},
              ],
            },
          ]}
        />
      ) : (
        <View style={[styles.fill, {width: fillWidth, backgroundColor: theme.primary}]} />
      )}
    </View>
  );
}

function SheetPanel({state, theme, labels, styles}) {
  const {status, update, progress, error, slow} = state;
  const titleStyle = [styles.title, {color: theme.text}];
  const messageStyle = [styles.message, {color: theme.mutedText}];

  if (status === "available") {
    const mandatory = update && update.isMandatory;
    return (
      <View>
        <Text style={titleStyle}>{mandatory ? labels.mandatoryTitle : labels.availableTitle}</Text>
        <Text style={messageStyle}>{mandatory ? labels.mandatoryMessage : labels.availableMessage}</Text>
        {update && update.description ? (
          <View style={styles.notes}>
            <Text style={[styles.notesTitle, {color: theme.text}]}>{labels.notesTitle}</Text>
            <Text style={messageStyle}>{update.description}</Text>
          </View>
        ) : null}
        <View style={styles.buttonRow}>
          {mandatory ? null : <SheetButton label={labels.later} onPress={state.dismiss} theme={theme} styles={styles} />}
          <SheetButton label={labels.updateNow} onPress={state.install} filled theme={theme} styles={styles} />
        </View>
      </View>
    );
  }

  if (status === "downloading" || status === "installing") {
    const installing = status === "installing";
    const detail = progress.hasRealProgress
      ? `${progress.percent}%${progress.totalBytes ? ` · ${formatBytes(progress.receivedBytes)} of ${formatBytes(progress.totalBytes)}` : ""}`
      : labels.preparing;
    return (
      <View>
        <Text style={titleStyle}>{installing ? labels.installingTitle : labels.downloadingTitle}</Text>
        <ProgressBar progress={progress} installing={installing} theme={theme} styles={styles} />
        {installing ? null : <Text style={messageStyle}>{detail}</Text>}
        {slow ? <Text style={messageStyle}>{labels.slow}</Text> : null}
      </View>
    );
  }

  if (status === "installed") {
    return (
      <View>
        <Text style={titleStyle}>{labels.installedTitle}</Text>
        <Text style={messageStyle}>{labels.installedMessage}</Text>
        <View style={styles.buttonRow}>
          <SheetButton label={labels.later} onPress={state.dismiss} theme={theme} styles={styles} />
          <SheetButton label={labels.restartNow} onPress={state.restart} filled theme={theme} styles={styles} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={titleStyle}>{labels.failedTitle}</Text>
      <Text style={[styles.message, {color: theme.danger}]}>{error || labels.failedMessage}</Text>
      <View style={styles.buttonRow}>
        <SheetButton label={labels.close} onPress={state.dismiss} theme={theme} styles={styles} />
        <SheetButton label={labels.retry} onPress={state.retry} filled theme={theme} styles={styles} />
      </View>
    </View>
  );
}

function PulsarUpdateSheet({theme: themeOverrides, labels: labelOverrides, renderContent, ...options}) {
  const {usePulsarUpdate} = require("./update");
  const state = usePulsarUpdate(options);
  const theme = {...DEFAULT_THEME, ...themeOverrides};
  const labels = {...DEFAULT_LABELS, ...labelOverrides};
  const visible =
    !state.dismissed && !(state.update && state.update.silent) && VISIBLE_STATUSES.includes(state.status);

  const lastVisibleState = React.useRef(state);
  if (visible) lastVisibleState.current = state;
  const shownState = visible ? state : lastVisibleState.current;

  const [mounted, setMounted] = React.useState(visible);
  const slide = React.useRef(new Animated.Value(visible ? 1 : 0)).current;

  React.useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, slide]);

  const dismissible =
    state.status === "installed" ||
    state.status === "failed" ||
    (state.status === "available" && !state.update.isMandatory);

  const {dismiss} = state;
  React.useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissible) dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, dismissible, dismiss]);

  if (!mounted) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, {opacity: slide}]} />
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {backgroundColor: theme.background},
          {transform: [{translateY: slide.interpolate({inputRange: [0, 1], outputRange: [SHEET_OFFSET, 0]})}]},
        ]}>
        {renderContent ? (
          renderContent(shownState)
        ) : (
          <SheetPanel state={shownState} theme={theme} labels={labels} styles={styles} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  notes: {
    marginTop: 16,
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    marginHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonPressed: {opacity: 0.7},
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 16,
  },
  trackBackground: {opacity: 0.2},
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  sweep: {
    width: "40%",
    height: "100%",
    borderRadius: 4,
  },
});

module.exports = PulsarUpdateSheet;
