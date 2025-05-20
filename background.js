chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.storage.local.set({ firstInstall: true }, () => {
            chrome.tabs.create({ url: "setup/setup.html" });
        });
    }
});

