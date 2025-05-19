chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.storage.local.set({ firstInstall: true }, () => {
            chrome.runtime.openOptionsPage();
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openSetupPage") {
        chrome.tabs.create({ url: "setup/setup.html" });
        sendResponse({ status: "Setup page opened" });
    }
});