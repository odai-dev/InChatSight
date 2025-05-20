// Initialize custom dropdown functionality
document.addEventListener("DOMContentLoaded", () => {
	const customSelect = document.querySelector(".custom-select");
	const selectedOption = customSelect.querySelector(".selected-option");
	const optionsContainer = customSelect.querySelector(".options-container");
	const options = customSelect.querySelectorAll(".option");

    if (customSelect && selectedOption && optionsContainer && options.length > 0) {
        selectedOption.addEventListener("click", () => {
            customSelect.classList.toggle("open");
        });
        options.forEach((option) => {
            option.addEventListener("click", () => {
                selectedOption.textContent = option.textContent;
                customSelect.classList.remove("open");
                console.log("Selected model:", option.textContent);
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
});

let OPENROUTER_API_KEY = null;

chrome.storage.local.get("apiKey", (data) => {
	OPENROUTER_API_KEY = data.apiKey;
	if (!OPENROUTER_API_KEY) {
        console.warn("API Key not found on initial load. Opening options page.");
		chrome.runtime.openOptionsPage();
	} else {
        console.log("API Key loaded successfully.");
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
						resolve([]);
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
    if (parts.length !== 3) return dateStr;
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
		return dateStr;
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

let messages = [];
let chatContextAttemptedForThisSession = false;

const chatWindow = document.getElementById("chatWindow");
const userPrompt = document.getElementById("userPrompt");
const sendBtn = document.getElementById("sendBtn");

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
		bubble.setAttribute("dir", "ltr");
	} else {
		const isRtl = /[\u0600-\u06FF]/.test(content);
		bubble.setAttribute("dir", isRtl ? "rtl" : "ltr");
		if (role === "ai") {
            if (typeof marked !== 'undefined') {
			    bubble.innerHTML = marked.parse(content);
            } else {
                console.warn("Marked.js library not found. Displaying raw AI content.");
                const pre = document.createElement('pre');
                pre.textContent = content;
                bubble.appendChild(pre);
            }
		} else {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = content;
			bubble.innerHTML = tempDiv.innerHTML.replace(/\n/g, "<br>");
		}
	}
	messageDiv.appendChild(bubble);
	chatWindow.appendChild(messageDiv);
	chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function handleUserMessage(userMessageText) {
    if (!OPENROUTER_API_KEY) {
      appendMessage("ai", "API key is not configured. Please set it in the extension options.");
      // No typingBubble reference here yet, so can't easily replace.
      // The appendMessage above will show, and then options page opens.
      chrome.runtime.openOptionsPage();
      return;
    }

	const supportedPlatforms = [
		"web.whatsapp.com",
		"instagram.com",
		"telegram.org",
		"messenger.com",
	];
	let currentUrl = "";
	const selectedElement = document.querySelector(".selected-option");
	const selectedModelText = selectedElement?.textContent.trim();
	const aiModel =
		(selectedModelText === "Select AI model" || !selectedModelText) ? "google/gemini-2.0-flash-001" : selectedModelText;

	try {
		currentUrl = await getCurrentTabUrl();

        console.log("[handleUserMessage] Current Tab URL:", currentUrl);
	} catch (error) {
		console.error("[handleUserMessage] Error getting current tab URL:", error.message);
		appendMessage("ai", `Could not determine the current page URL: ${error.message}`);
		return;
	}

	const isOnSupportedPlatform = supportedPlatforms.some((platform) =>
		currentUrl.includes(platform)
	);
    console.log("[handleUserMessage] Is on supported platform?", isOnSupportedPlatform, "(Platform:", currentUrl.includes("web.whatsapp.com") ? "WhatsApp" : "Other", ")");

	let pageChatContextForAPI = null;

    if (messages.length === 0) {
        const systemPromptContent = isOnSupportedPlatform
            ? chatAnalyzerSystemPrompt
            : defaultSystemPrompt;
        messages.push({ role: "system", content: systemPromptContent });
        console.log("[handleUserMessage] Initialized messages. Using system prompt:", isOnSupportedPlatform ? "Chat Analyzer Mode" : "Default AI Assistant Mode");
    }

	if (isOnSupportedPlatform && !chatContextAttemptedForThisSession) {
		appendMessage("ai", "Accessing chat messages from the current page...");

        console.log("[handleUserMessage] Attempting to fetch chat messages for supported platform.");
		try {
			const chatMessagesFromPage = await getChatMessagesFromContentScript();
    
            console.log("[handleUserMessage] Fetched chatMessagesFromPage:", chatMessagesFromPage);

			if (chatMessagesFromPage && chatMessagesFromPage.length > 0) { // Check if array and has items
				const formattedChat = formatChatForAI(chatMessagesFromPage);
        
                console.log("[handleUserMessage] Formatted chat for API:", formattedChat ? formattedChat.substring(0, 200) + "..." : "null/empty");
				pageChatContextForAPI = {
					role: "system",
					content: `Here is the chat history from the current page (${currentUrl}). Please analyze it based on my previous instructions:\n${formattedChat}`,
				};
				appendMessage(
					"ai",
					"I've loaded the chat from the current page to provide context for my responses."
				);
                console.log("[handleUserMessage] pageChatContextForAPI successfully created.");
			} else {
        
                console.warn("[handleUserMessage] No chat messages found on page or content script returned empty/invalid.");
				appendMessage(
					"ai",
					"No chat messages found on the page, or I couldn't access them. You can continue the conversation without this context."
				);
			}
		} catch (error) {
			console.error("[handleUserMessage] Error processing chat messages from page:", error.message);
			appendMessage(
				"ai",
				`I encountered an issue trying to retrieve chat messages: ${error.message}. You can still chat, but without page context.`
			);
		} finally {
			chatContextAttemptedForThisSession = true;
            console.log("[handleUserMessage] chatContextAttemptedForThisSession set to true.");
		}
	} else if (
		!isOnSupportedPlatform &&
		!chatContextAttemptedForThisSession &&
		userMessageText.toLowerCase().match(/chat|messages|conversation|analyze this/)
	) {
		appendMessage(
			"ai",
			"I can only access and analyze chat messages on WhatsApp, Instagram, Telegram, or Messenger. Please navigate to one of these platforms if you want me to analyze a chat."
		);
		chatContextAttemptedForThisSession = true;
	}

	messages.push({ role: "user", content: userMessageText });

	appendMessage("ai", "Typing...");
	let typingBubble = chatWindow.querySelector(".chat-bubble.ai.typing-indicator");

	let apiMessagesToSend = [...messages];
	if (pageChatContextForAPI) {
        console.log("[handleUserMessage] Adding pageChatContextForAPI to apiMessagesToSend.");
		apiMessagesToSend.splice(1, 0, pageChatContextForAPI);
	} else {

        console.log("[handleUserMessage] pageChatContextForAPI is null, not adding to API request.");
    }

	console.log("[handleUserMessage] Final messages being sent to API:", JSON.stringify(apiMessagesToSend, null, 2));

	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: aiModel,
				max_tokens: 1000,
				temperature: 0.7,
				messages: apiMessagesToSend,
			}),
		});

		if (!res.ok) {
			const errorData = await res.json().catch(() => ({ error: { message: "Unknown API error" } }));
			const statusText = res.statusText || "Failed to fetch";
			const errorMessage =
				errorData.error?.message ||
				`API request failed with status ${res.status}: ${statusText}`;
			throw new Error(errorMessage);
		}

		const data = await res.json();
		const aiResponse =
			data.choices[0]?.message?.content.trim() ||
			"No response received from AI, or the response was empty.";

		if (typingBubble) {
            if (typeof marked !== 'undefined') {
			    typingBubble.innerHTML = marked.parse(aiResponse);
            } else {
                typingBubble.textContent = aiResponse;
            }
			const rtl = /[\u0600-\u06FF]/.test(aiResponse);
			typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
			typingBubble.classList.remove("typing-indicator");
		} else {
			appendMessage("ai", aiResponse);
		}
		messages.push({ role: "assistant", content: aiResponse });
	} catch (err) {
		console.error("[handleUserMessage] Error fetching AI response:", err.message);
		const errorMessageText =
			err.message ||
			"Error: Unable to fetch response. Please check your connection or API key.";
		if (typingBubble) {
            if (typeof marked !== 'undefined') {
			    typingBubble.innerHTML = marked.parse(`Error: ${errorMessageText}`);
            } else {
                typingBubble.textContent = `Error: ${errorMessageText}`;
            }
			const rtl = /[\u0600-\u06FF]/.test(errorMessageText);
			typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
			typingBubble.classList.remove("typing-indicator");
		} else {
			appendMessage("ai", `Error: ${errorMessageText}`);
		}
	} finally {
		if (chatWindow) {
			chatWindow.scrollTop = chatWindow.scrollHeight;
		}
        if (userPrompt) userPrompt.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = "Send"; // Reset button text/icon
        }
	}
}

if (sendBtn && userPrompt) {
    sendBtn.addEventListener("click", async () => {
        const userMessageText = userPrompt.value.trim();
        if (!userMessageText || sendBtn.disabled) return;
        appendMessage("user", userMessageText);
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
    console.error("Send button or user prompt element not found. Event listeners not attached.");
}