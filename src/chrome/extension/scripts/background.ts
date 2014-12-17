/**
 * background.ts
 *
 * This is the background page for the Extension. It maintains a chrome runtime
 * connection with the App, consistent state changes with the UI (see ui.js).
 */
// Assumes that core_stub.ts has been loaded.
// UserInterface is defined in 'generic_ui/scripts/ui.ts'.

/// <reference path='chrome_browser_api.ts' />
/// <reference path='chrome_connector.ts' />
/// <reference path='chrome_tab_auth.ts' />

/// <reference path='../../../interfaces/ui.d.ts' />
/// <reference path='../../../generic_ui/scripts/ui.ts' />
/// <reference path='../../../generic_ui/scripts/core_connector.ts' />

/// <reference path='../../../freedom/typings/social.d.ts' />
/// <reference path='../../../third_party/typings/chrome/chrome.d.ts'/>


var ui   :UI.UserInterface;  // singleton referenced in both options and popup.
// --------------------- Communicating with the App ----------------------------
var chromeConnector :ChromeConnector;  // way for ui to speak to a uProxy.CoreAPI
var core :CoreConnector;  // way for ui to speak to a uProxy.CoreAPI
var chromeBrowserApi :ChromeBrowserApi;

// Chrome Window ID given to the uProxy popup.
var popupWindowId = chrome.windows.WINDOW_ID_NONE;
// The URL to launch when the user clicks on the extension icon.
var popupUrl = "app-missing.html";
// Chrome Window ID of the window used to launch uProxy,
// i.e. the window where the extension icon was clicked.
var mainWindowId = chrome.windows.WINDOW_ID_NONE;

chrome.runtime.onSuspend.addListener(() => {
  console.log('onSuspend');
  //proxyConfig.stopUsingProxy();
});

/**
  * Set the URL of the uProxy popup.
  */
var updatePopupUrl = (url) : void => {
  if (popupUrl == url) {
    return;
  }

  popupUrl = url;
  // If an existing popup exists, update the page shown in the existing
  // popup.
  if (popupWindowId != chrome.windows.WINDOW_ID_NONE) {
    chrome.windows.get(popupWindowId, {populate: true}, (popupWindow) => {
      chrome.tabs.update(popupWindow.tabs[0].id, {url: popupUrl});
    });
  }
}

// Launch the Chrome webstore page for the uProxy app.
function openDownloadAppPage() : void {
  chrome.tabs.create(
      {url: 'https://chrome.google.com/webstore/detail/uproxyapp/fmdppkkepalnkeommjadgbhiohihdhii'},
      (tab) => {
        // Focus on the new Chrome Webstore tab.
        chrome.windows.update(tab.windowId, {focused: true});
      });
  chromeConnector.waitingForAppInstall = true;
}

/**
 * Primary initialization of the Chrome Extension. Installs hooks so that
 * updates from the Chrome App side propogate to the UI.
 */
function initUI() : UI.UserInterface {
  chromeBrowserApi = new ChromeBrowserApi();
  // TODO (lucyhe): Make sure that the "install" event isn't missed if we
  // are adding the listener after the event is fired.
  chrome.runtime.onInstalled.addListener(chromeBrowserApi.bringUproxyToFront);
  chrome.browserAction.onClicked.addListener((tab) => {
    // When the extension icon is clicked, open uProxy.
    mainWindowId = tab.windowId;
    chromeBrowserApi.bringUproxyToFront();
  });
  chrome.windows.onRemoved.addListener((closedWindowId) => {
    // If either the window launching uProxy, or the popup with uProxy
    // is closed, reset the IDs tracking those windows.
    if (closedWindowId == popupWindowId) {
      popupWindowId = chrome.windows.WINDOW_ID_NONE;
    } else if (closedWindowId == mainWindowId) {
      mainWindowId = chrome.windows.WINDOW_ID_NONE;
    }
  });

  chromeConnector = new ChromeConnector({ name: 'uproxy-extension-to-app-port' });
  chromeConnector.onUpdate(uProxy.Update.LAUNCH_UPROXY,
                           chromeBrowserApi.bringUproxyToFront);
  chromeConnector.connect();

  core = new CoreConnector(chromeConnector);
  var oAuth = new ChromeTabAuth();
  chromeConnector.onUpdate(uProxy.Update.GET_CREDENTIALS,
                           oAuth.login.bind(oAuth));

  chrome.webRequest.onBeforeRequest.addListener(
    function() {
      return {cancel: true};
    },
    {urls: ['https://www.uproxy.org/oauth-redirect-uri*']},
    ['blocking']
  );

  return new UI.UserInterface(core, chromeBrowserApi);
}

console.log('Initializing chrome extension background page...');
if (undefined === ui) {
  ui = initUI();
}
