document.getElementById("saveBtn").addEventListener("click", () => {
	const key = document.getElementById("apiKeyInput").value.trim();
	if (key) {
		chrome.storage.local.set({ apiKey: key }, () => {
			document.getElementById("status").textContent = "API Key saved";
			//close the current tab 1 second after the key is saved
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				if (tabs.length > 0) {
					const tabId = tabs[0].id;
					setTimeout(() => {
						chrome.tabs.remove(tabId);
					}, 1000); // 1000ms = 1 second
				}
			});
		});
	} else {
		document.getElementById("status").textContent = "Please enter a valid key";
	}
});
