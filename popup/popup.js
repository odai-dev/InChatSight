// popup.js

// Global variable for messages, will be populated from storage or initialized
let messages = [];
let OPENROUTER_API_KEY = null;
let chatContextAttemptedForThisSession = false; // Reset on each popup load
let sessionFetchedPageContext = null; // << NEW: To store page context for the current session

const chatWindow = document.getElementById("chatWindow");
const userPrompt = document.getElementById("userPrompt");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn"); // Get reference to Reset Button
const customSelect = document.querySelector(".custom-select");
const selectedOption = customSelect?.querySelector(".selected-option");
const optionsContainer = customSelect?.querySelector(".options-container");
const options = customSelect?.querySelectorAll(".option");

// --- Storage Keys ---
const STORAGE_KEY_CHAT_MESSAGES = "chatGPTContextMessages";
const STORAGE_KEY_SELECTED_MODEL = "chatGPTSelectedModel";

// --- State Management Functions ---
async function saveState() {
    if (!chrome.storage || !chrome.storage.local) {
        console.warn("chrome.storage.local is not available. State cannot be saved.");
        return;
    }
    const stateToSave = {
        [STORAGE_KEY_CHAT_MESSAGES]: messages // Only save the main chat history
    };
    if (selectedOption && selectedOption.textContent !== "Select AI model") {
        stateToSave[STORAGE_KEY_SELECTED_MODEL] = selectedOption.textContent;
    }
    try {
        await chrome.storage.local.set(stateToSave);
        console.log("State saved:", stateToSave);
    } catch (error) {
        console.error("Error saving state:", error);
    }
}

async function loadState() {
    // chatContextAttemptedForThisSession is reset by virtue of popup loading
    // sessionFetchedPageContext is also reset by virtue of popup loading (as it's a 'let' at the top level)
    if (!chrome.storage || !chrome.storage.local) {
        console.warn("chrome.storage.local is not available. State cannot be loaded.");
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY_CHAT_MESSAGES, STORAGE_KEY_SELECTED_MODEL], (data) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading state:", chrome.runtime.lastError.message);
                resolve();
                return;
            }
            console.log("State loaded from storage:", data);
            if (data[STORAGE_KEY_CHAT_MESSAGES] && Array.isArray(data[STORAGE_KEY_CHAT_MESSAGES])) {
                messages = data[STORAGE_KEY_CHAT_MESSAGES];
                if (chatWindow) {
                    chatWindow.innerHTML = "";
                    messages.forEach(msg => {
                        if (!(msg.role === 'ai' && msg.content === 'Typing...')) {
                            appendMessage(msg.role, msg.content);
                        }
                    });
                }
            } else {
                messages = [];
            }
            if (data[STORAGE_KEY_SELECTED_MODEL] && selectedOption) {
                selectedOption.textContent = data[STORAGE_KEY_SELECTED_MODEL];
            }
            resolve();
        });
    });
}

// --- Reset Chat Function (No Confirmation) ---
async function resetChat() {
    messages = [];
    if (chatWindow) {
        chatWindow.innerHTML = "";
    }
    chatContextAttemptedForThisSession = false;
    sessionFetchedPageContext = null; // << NEW: Reset session context
    await saveState();
    console.log("Chat has been reset immediately.");
}


// --- Initialization and Event Listeners ---
document.addEventListener("DOMContentLoaded", async () => {
    // Reset session-specific flags on popup load
    chatContextAttemptedForThisSession = false;
    sessionFetchedPageContext = null;

    // 1. Initialize custom dropdown
    if (customSelect && selectedOption && optionsContainer && options.length > 0) {
        selectedOption.addEventListener("click", () => {
            customSelect.classList.toggle("open");
        });
        options.forEach((option) => {
            option.addEventListener("click", () => {
                selectedOption.textContent = option.textContent;
                customSelect.classList.remove("open");
                console.log("Selected model:", option.textContent);
                saveState();
            });
        });
        document.addEventListener("click", (e) => {
            if (!customSelect.contains(e.target)) {
                customSelect.classList.remove("open");
            }
        });
    } else {
        console.warn("Custom select elements not fully found. Dropdown functionality might be impaired.");
    }

    // 2. Load API Key
    try {
        const data = await new Promise((resolve, reject) => {
            chrome.storage.local.get("apiKey", (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
        OPENROUTER_API_KEY = data.apiKey;
        if (!OPENROUTER_API_KEY) {
            console.warn("API Key not found on initial load. Opening options page.");
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                console.error("chrome.runtime.openOptionsPage is not available.");
                appendMessage("ai", "API Key is not set. Please configure it in the extension options.");
            }
        } else {
            console.log("API Key loaded successfully.");
        }
    } catch (error) {
        console.error("Error loading API key:", error);
        appendMessage("ai", "Error loading API key. Please check extension options or console.");
    }

    // 3. Load saved state (chat messages, selected model)
    await loadState(); // This also repopulates chatWindow

    // 4. Setup send button and input listeners
    if (sendBtn && userPrompt && chatWindow) {
        sendBtn.addEventListener("click", async () => {
            const userMessageText = userPrompt.value.trim();
            if (!userMessageText || sendBtn.disabled) return;

            appendMessage("user", userMessageText);
            messages.push({ role: "user", content: userMessageText });
            await saveState();

            userPrompt.value = "";
            userPrompt.disabled = true;
            sendBtn.disabled = true;
            sendBtn.textContent = "Sending...";
            await handleUserMessage(userMessageText);
        });

        userPrompt.addEventListener("keypress", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !sendBtn.disabled) {
                event.preventDefault();
                sendBtn.click();
            }
        });
    } else {
        console.error("Send button, user prompt, or chat window element not found. Event listeners not attached.");
    }

    // 5. Setup Reset Button Listener
    if (resetBtn) {
        resetBtn.addEventListener("click", resetChat);
    } else {
        console.warn("Reset button element not found. Reset functionality will not be available.");
    }
});


async function getChatMessagesFromContentScript() {
	return new Promise((resolve, reject) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs || tabs.length === 0 || !tabs[0]?.id) {
                console.error("[getChatMessagesFromContentScript] No active tab found or tab ID is missing.", tabs);
                return reject(new Error("No active tab found or tab ID is missing."));
            }
            console.log("[getChatMessagesFromContentScript] Querying tab:", tabs[0].id, "for URL:", tabs[0].url);

			chrome.tabs.sendMessage(
				tabs[0].id,
				{ action: "getChatMessages" },
				(response) => {
					if (chrome.runtime.lastError) {
                        console.error("[getChatMessagesFromContentScript] Error sending/receiving message:", chrome.runtime.lastError.message, "Tab URL:", tabs[0].url);
						return reject(new Error(chrome.runtime.lastError.message || "Unknown error sending/receiving message from content script."));
					}
                    console.log("[getChatMessagesFromContentScript] Response from content script:", response);

					if (response && response.messages) {
                        console.log("[getChatMessagesFromContentScript] Received messages:", response.messages.length);
						resolve(response.messages);
					} else if (response && response.error) {
                        console.error("[getChatMessagesFromContentScript] Content script returned an error:", response.error);
						reject(new Error(response.error));
					} else if (response === undefined && tabs[0].url.startsWith("chrome://")) {
                        console.warn("[getChatMessagesFromContentScript] Cannot access chrome:// pages.");
                        reject(new Error("Cannot access chrome:// pages for chat messages."));
                    } else {
						console.warn("[getChatMessagesFromContentScript] Received unexpected response or no messages array from content script. Assuming empty.", response);
						resolve([]); // Resolve with empty array for resilience
					}
				}
			);
		});
	});
}

async function getCurrentTabUrl() {
	return new Promise((resolve, reject) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs || tabs.length === 0 || !tabs[0]?.url) {
                console.error("[getCurrentTabUrl] No active tab URL found.", tabs);
                return reject(new Error("No active tab URL found."));
            }
			resolve(tabs[0].url);
		});
	});
}

function formatChatForAI(chat) {
    console.log("[formatChatForAI] Formatting chat with", chat.length, "messages.");
	return chat
		.map((message) => {
			if (
				!message.timestamp ||
				typeof message.timestamp !== "string" ||
				!message.timestamp.includes(",")
			) {
				console.warn("[formatChatForAI] Invalid or missing timestamp for message:", message);
				return `${message.author || "Unknown"}: ${
					message.text || "[No text provided]"
				}`;
			}
			const [timePart, datePart] = message.timestamp.split(",", 2);
			const formattedDate = formatDate(datePart ? datePart.trim() : "");
			const formattedTime = formatTime(timePart ? timePart.trim() : "");
			return `${
				message.author || "Unknown"
			} [${formattedDate}, ${formattedTime}]: ${
				message.text || "[No text provided]"
			}`;
		})
		.join("\n");
}

function formatDate(dateStr) {
    if (!dateStr) return "Unknown Date";
	const parts = dateStr.split("/");
    if (parts.length !== 3) return dateStr; // Return original if not in expected format
	const [day, month, year] = parts;
	const months = [
		"January", "February", "March", "April", "May", "June", "July",
		"August", "September", "October", "November", "December",
	];
	const dayInt = parseInt(day);
	const monthInt = parseInt(month);
	if (
		isNaN(dayInt) || isNaN(monthInt) || !year ||
		monthInt < 1 || monthInt > 12 || dayInt < 1 || dayInt > 31
	) {
		return dateStr; // Return original if parts are invalid
	}
	return `${dayInt} ${months[monthInt - 1]} ${year}`;
}

function formatTime(timeStr) {
    if (!timeStr) return "Unknown Time";
	return timeStr.toUpperCase();
}

const chatAnalyzerSystemPrompt = `You are a socially intelligent AI assistant embedded in a chat interface.
Your role is to provide helpful insights, emotional analysis, or strategic guidance based on chat
You can:
- Summarize key points from the conversation.
- Detect emotional tone, interest levels, or intentions.
- Highlight any red flags, contradictions, or manipulation.
- Offer advice, reflection, or third-person perspective on the situation.
- respond with the language that user sent his latest message with to you with eg: English, arabic etc.. .
Only rely on the messages below. Always back your analysis with examples from the chat if it was provided.
Output should be empathetic, neutral, and thoughtful — like a good friend who's also a therapist. Never mention that you're an AI model. Focus on communication analysis.`;

const defaultSystemPrompt = `
You are a helpful and friendly AI assistant. You can chat casually, help with tasks, answer questions, and act like a normal AI assistant. Be smart, polite, and useful.
`;


function appendMessage(role, content) {
    if (!chatWindow) {
        console.error("chatWindow element not found in appendMessage");
        return;
    }
	const messageDiv = document.createElement("div");
	messageDiv.className = `chat-message ${role}`;
	const bubble = document.createElement("div");
	bubble.className = `chat-bubble ${role}`;
	if (role === "ai" && content === "Typing...") {
		bubble.classList.add("typing-indicator");
		bubble.innerHTML = "<div class='dots-container'><span></span><span></span><span></span></div>";
		bubble.setAttribute("dir", "ltr"); // Typing indicator is usually LTR
	} else {
		const isRtl = /[\u0600-\u06FF]/.test(content); // Basic RTL detection
		bubble.setAttribute("dir", isRtl ? "rtl" : "ltr");
		if (role === "ai") { // This will now correctly handle all AI/system messages
            if (typeof marked !== 'undefined') {
			    bubble.innerHTML = marked.parse(content);
            } else {
                console.warn("Marked.js library not found. Displaying raw AI content.");
                const pre = document.createElement('pre');
                pre.textContent = content;
                bubble.appendChild(pre);
            }
		} else { // User message (role === "user")
            const tempDiv = document.createElement('div');
            tempDiv.textContent = content; // Safely set text content
			bubble.innerHTML = tempDiv.innerHTML.replace(/\n/g, "<br>"); // Convert newlines to <br>
		}
	}
	messageDiv.appendChild(bubble);
	chatWindow.appendChild(messageDiv);
	chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function handleUserMessage(userMessageText) {
    if (!OPENROUTER_API_KEY) {
      appendMessage("ai", "API key is not configured. Please set it in the extension options.");
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      if (userPrompt) userPrompt.disabled = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
      return;
    }

	const supportedPlatforms = ["web.whatsapp.com", "instagram.com", "telegram.org", "messenger.com"];
	let currentUrl = "";
	const selectedModelText = selectedOption?.textContent.trim();
	const aiModel = (selectedModelText === "Select AI model" || !selectedModelText) ? "google/gemini-2.0-flash-001" : selectedModelText;

	try {
		currentUrl = await getCurrentTabUrl();
        console.log("[handleUserMessage] Current Tab URL:", currentUrl);
	} catch (error) {
		console.error("[handleUserMessage] Error getting current tab URL:", error.message);
        appendMessage("ai", `Could not determine the current page URL: ${error.message}`);
        if (userPrompt) userPrompt.disabled = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
		return;
	}

	const isOnSupportedPlatform = supportedPlatforms.some(platform => currentUrl.includes(platform));
    console.log("[handleUserMessage] Is on supported platform?", isOnSupportedPlatform);

    // Ensure a system prompt exists in `messages` (persisted history)
    // This should be the *main* system prompt, not the page context.
    if (messages.length === 0 || messages.find(m => m.role === "system" && (m.content.trim() === chatAnalyzerSystemPrompt.trim() || m.content.trim() === defaultSystemPrompt.trim())) === undefined) {
        // If no system prompt, or the first message isn't THE system prompt, prepend one.
        // Clear any other leading non-system messages if messages[0] is not the right system prompt.
        messages = messages.filter(m => m.role === "user" || m.role === "ai" || (m.role === "system" && (m.content.trim() === chatAnalyzerSystemPrompt.trim() || m.content.trim() === defaultSystemPrompt.trim())));

        const systemPromptContent = isOnSupportedPlatform ? chatAnalyzerSystemPrompt : defaultSystemPrompt;
        messages.unshift({ role: "system", content: systemPromptContent });
        console.log("[handleUserMessage] Ensured/Prepended main system prompt:", isOnSupportedPlatform ? "Chat Analyzer Mode" : "Default AI Assistant Mode");
        await saveState(); // Save if we modified messages
    }


	if (isOnSupportedPlatform && !chatContextAttemptedForThisSession) {
		appendMessage("ai", "Accessing chat messages from the current page...");
        let typingBubbleForContext = chatWindow.querySelector(".chat-bubble.ai.typing-indicator");
        console.log("[handleUserMessage] Attempting to fetch chat messages for supported platform.");
		try {
			const chatMessagesFromPage = await getChatMessagesFromContentScript();
            if (typingBubbleForContext) typingBubbleForContext.parentElement.remove(); // Remove "Accessing..." typing indicator

			if (chatMessagesFromPage && chatMessagesFromPage.length > 0) {
				const formattedChat = formatChatForAI(chatMessagesFromPage);
                // Store in session-specific variable, not in persisted `messages`
				sessionFetchedPageContext = {
					role: "system",
					content: `Here is the chat history from the current page (${currentUrl}). Please analyze it based on my previous instructions:\n${formattedChat}`,
				};
                const contextLoadedMsg = "I've loaded the chat from the current page to provide context for my responses.";
				appendMessage("ai", contextLoadedMsg);
                messages.push({role: "ai", content: contextLoadedMsg}); // This notification IS saved
                await saveState();
                console.log("[handleUserMessage] sessionFetchedPageContext successfully created.");
			} else {
                sessionFetchedPageContext = null; // Explicitly nullify if no context found
                const noContextMsg = "No chat messages found on the page, or I couldn't access them. You can continue the conversation without this context.";
				appendMessage("ai", noContextMsg);
                messages.push({role: "ai", content: noContextMsg}); // Save notification
                await saveState();
			}
		} catch (error) {
            if (typingBubbleForContext) typingBubbleForContext.parentElement.remove();
            sessionFetchedPageContext = null; // Explicitly nullify on error
			console.error("[handleUserMessage] Error processing chat messages from page:", error.message);
            const contextErrorMsg = `I encountered an issue trying to retrieve chat messages: ${error.message}. You can still chat, but without page context.`;
			appendMessage("ai", contextErrorMsg);
            messages.push({role: "ai", content: contextErrorMsg}); // Save notification
            await saveState();
		} finally {
			chatContextAttemptedForThisSession = true;
            console.log("[handleUserMessage] chatContextAttemptedForThisSession set to true.");
		}
	} else if (!isOnSupportedPlatform && !chatContextAttemptedForThisSession && messages.filter(m => m.role === 'user').length <= 1 && userMessageText.toLowerCase().match(/chat|messages|conversation|analyze this/)) {
        const platformWarningMsg = "I can only access and analyze chat messages on WhatsApp, Instagram, Telegram, or Messenger. Please navigate to one of these platforms if you want me to analyze a chat.";
		appendMessage("ai", platformWarningMsg);
        messages.push({role: "ai", content: platformWarningMsg}); // Save notification
        await saveState();
		chatContextAttemptedForThisSession = true; // Mark as attempted to avoid repeated warnings
	}

	appendMessage("ai", "Typing...");
	let typingBubble = chatWindow.querySelector(".chat-bubble.ai.typing-indicator");

    // --- Construct messages for API ---
	let apiMessagesToSend = [];

    // 1. Get the main system prompt from `messages` (persisted history)
    const mainSystemPromptInMessages = messages.find(msg =>
        msg.role === "system" &&
        (msg.content.trim() === chatAnalyzerSystemPrompt.trim() || msg.content.trim() === defaultSystemPrompt.trim())
    );

    if (mainSystemPromptInMessages) {
        apiMessagesToSend.push(mainSystemPromptInMessages);
    } else {
        // Fallback if somehow main system prompt isn't in messages (should be handled by logic above)
        console.warn("[handleUserMessage] Main system prompt unexpectedly not found in messages array. Re-creating for API call.");
        const systemPromptContent = isOnSupportedPlatform ? chatAnalyzerSystemPrompt : defaultSystemPrompt;
        apiMessagesToSend.push({ role: "system", content: systemPromptContent });
    }

    // 2. Add the session-specific page context, if it was fetched and exists
    if (sessionFetchedPageContext) {
        apiMessagesToSend.push(sessionFetchedPageContext);
        console.log("[handleUserMessage] Including sessionFetchedPageContext in API request.");
    } else {
        console.log("[handleUserMessage] No sessionFetchedPageContext to include in API request.");
    }

    // 3. Add all other messages (user messages, AI responses, AI notifications like "I've loaded...")
    //    from the global `messages` array, ensuring not to re-add the main system prompt.
    messages.forEach(msg => {
        if (msg !== mainSystemPromptInMessages) { // Only add if it's not the main system prompt already added
            apiMessagesToSend.push(msg);
        }
    });
    // --- End Construct messages for API ---


	console.log("[handleUserMessage] Final messages being sent to API:", JSON.stringify(apiMessagesToSend.map(m=>({role: m.role, content: m.content.substring(0,100) + (m.content.length > 100 ? "..." : "")})), null, 2));

	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: aiModel, max_tokens: 1000, temperature: 0.7, messages: apiMessagesToSend }),
		});

		if (!res.ok) {
			const errorData = await res.json().catch(() => ({ error: { message: "Unknown API error, response not JSON." } }));
			throw new Error(errorData.error?.message || `API request failed with status ${res.status}: ${res.statusText}`);
		}

		const data = await res.json();
		const aiResponse = data.choices[0]?.message?.content.trim() || "No response received from AI, or the response was empty.";

		if (typingBubble) typingBubble.parentElement.remove();
		appendMessage("ai", aiResponse);
		messages.push({ role: "ai", content: aiResponse }); // This is an AI response, save it
        await saveState();

	} catch (err) {
		console.error("[handleUserMessage] Error fetching AI response:", err.message, err.stack);
		if (typingBubble) typingBubble.parentElement.remove();
		appendMessage("ai", `Error: ${err.message || "Unable to fetch response."}`);
        // Do not save API errors to the main chat history by default
	} finally {
		if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
        if (userPrompt) userPrompt.disabled = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
	}
}