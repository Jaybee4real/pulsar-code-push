const React = require("react");
const {AppState} = require("react-native");
const CodePush = require("./CodePush");
const {createUpdateController} = require("./update-controller");
const {parseUpdateConfig} = require("./update-config");

function usePulsarUpdate(options = {}) {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const controllerRef = React.useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createUpdateController({
      codePush: CodePush,
      getOptions: () => ({...optionsRef.current, isDev: typeof __DEV__ !== "undefined" && __DEV__}),
    });
  }
  const controller = controllerRef.current;
  const [state, setState] = React.useState(controller.getState);

  React.useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    setState(controller.getState());
    controller.onAppStateChange(AppState.currentState);
    controller.check();
    const appStateSubscription = AppState.addEventListener("change", controller.onAppStateChange);
    return () => {
      unsubscribe();
      appStateSubscription.remove();
      controller.dispose();
    };
  }, [controller]);

  return {
    ...state,
    install: controller.install,
    dismiss: controller.dismiss,
    retry: controller.retry,
    restart: controller.restart,
  };
}

module.exports = {usePulsarUpdate, parseUpdateConfig};
module.exports.PulsarUpdateSheet = require("./UpdateSheet");
