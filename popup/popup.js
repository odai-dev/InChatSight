// Initialize custom dropdown functionality
document.addEventListener("DOMContentLoaded", () => {
	const customSelect = document.querySelector(".custom-select");
	const selectedOption = customSelect.querySelector(".selected-option");
	const optionsContainer = customSelect.querySelector(".options-container");
	const options = customSelect.querySelectorAll(".option");

	// Toggle dropdown open/close on click
	selectedOption.addEventListener("click", () => {
		customSelect.classList.toggle("open");
	});

	// Update selected option and close dropdown
	options.forEach((option) => {
		option.addEventListener("click", () => {
			selectedOption.textContent = option.textContent;
			customSelect.classList.remove("open");
			console.log("Selected model:", option.textContent);
		});
	});

	// Close dropdown if clicked outside
	document.addEventListener("click", (e) => {
		if (!customSelect.contains(e.target)) {
			customSelect.classList.remove("open");
		}
	});
});

// Retrieve API key from Chrome storage
let OPENROUTER_API_KEY = null;

chrome.storage.local.get("apiKey", (data) => {
	OPENROUTER_API_KEY = data.apiKey;
	if (!OPENROUTER_API_KEY) {
		chrome.runtime.openOptionsPage(); // Open options page if API key is missing
	}
});

// Fetch chat messages from the content script
async function getChatMessagesFromContentScript() {
	return new Promise((resolve, reject) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs[0]?.id) return reject("No active tab");
			chrome.tabs.sendMessage(
				tabs[0].id,
				{ action: "getChatMessages" },
				(response) => {
					if (chrome.runtime.lastError) {
						return reject(chrome.runtime.lastError.message);
					}
					// Ensure response structure is handled, expecting response.messages
					if (response && response.messages) {
						resolve(response.messages);
					} else if (response && response.error) {
						reject(new Error(response.error));
					} else {
						resolve([]); // Resolve with empty array if no messages or unexpected response
					}
				}
			);
		});
	});
}

// Get the URL of the current active tab
async function getCurrentTabUrl() {
	return new Promise((resolve, reject) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs[0]?.url) return reject("No active tab URL found");
			resolve(tabs[0].url);
		});
	});
}

// Format chat messages for AI processing
function formatChatForAI(chat) {
	return chat
		.map((message) => {
			// Ensure timestamp exists and is a string before trying to split
			if (
				!message.timestamp ||
				typeof message.timestamp !== "string" ||
				!message.timestamp.includes(",")
			) {
				console.warn("Invalid or missing timestamp:", message);
				// Provide a default or skip formatting if timestamp is problematic
				return `${message.author || "Unknown"}: ${
					message.text || "[No text provided]"
				}`;
			}

			const [timePart, datePart] = message.timestamp.split(",");
			const formattedDate = formatDate(datePart.trim());
			const formattedTime = formatTime(timePart.trim());

			return `${
				message.author || "Unknown"
			} [${formattedDate}, ${formattedTime}]: ${
				message.text || "[No text provided]"
			}`;
		})
		.join("\n");
}

// Format date into a readable format
function formatDate(dateStr) {
	const [day, month, year] = dateStr.split("/");
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	// Basic validation for parsed parts
	const dayInt = parseInt(day);
	const monthInt = parseInt(month);
	if (
		isNaN(dayInt) ||
		isNaN(monthInt) ||
		!year ||
		monthInt < 1 ||
		monthInt > 12
	) {
		return dateStr; // Return original if parsing fails
	}
	return `${dayInt} ${months[monthInt - 1]} ${year}`;
}

// Format time to uppercase (AM/PM)
function formatTime(timeStr) {
	return timeStr.toUpperCase();
}

// Initialize system message content
const initialSystemMessageContent = `You are a socially intelligent AI assistant embedded in a chat interface.
Your role is to provide helpful insights, emotional analysis, or strategic guidance based on chat
You can:
- Summarize key points from the conversation.
- Detect emotional tone, interest levels, or intentions.
- Highlight any red flags, contradictions, or manipulation.
- Offer advice, reflection, or third-person perspective on the situation.
- respond with the language that user sent his latest message with to you with eg: English, arabic etc.. .
Only rely on the messages below. Always back your analysis with examples from the chat if it was provided.
Output should be empathetic, neutral, and thoughtful — like a good friend who's also a therapist.`;

// This 'messages' array stores the conversation history with the AI (user queries and AI responses).
// It always starts with the main system prompt.
let messages = [
	{
		role: "system",
		content: initialSystemMessageContent,
	},
];

let chatContextAttemptedForThisSession = false; // Flag to track if context fetch was attempted

const chatWindow = document.getElementById("chatWindow");
const userPrompt = document.getElementById("userPrompt");
const sendBtn = document.getElementById("sendBtn");

// Append a message to the chat window
function appendMessage(role, content) {
	const messageDiv = document.createElement("div");
	messageDiv.className = `chat-message ${role}`;

	const bubble = document.createElement("div");
	bubble.className = `chat-bubble ${role}`;

	if (role === "ai" && content === "Typing...") {
		bubble.classList.add("typing-indicator");
		bubble.innerHTML =
			"<div class='dots-container'><span></span><span></span><span></span></div>";
		bubble.setAttribute("dir", "ltr");
	} else {
		const isRtl = /[\u0600-\u06FF]/.test(content); // Simple RTL check
		bubble.setAttribute("dir", isRtl ? "rtl" : "ltr");

		if (role === "ai") {
			bubble.innerHTML = marked.parse(content); // Using 'marked' library
		} else {
			bubble.innerHTML = content.replace(/\n/g, "<br>");
		}
	}

	messageDiv.appendChild(bubble);
	chatWindow.appendChild(messageDiv);
	chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Handle user message and AI response
async function handleUserMessage(userMessage) {
	const supportedPlatforms = [
		"whatsapp.com",
		"instagram.com",
		"telegram.org",
		"messenger.com",
	];
	let currentUrl = "";
	const selectedElement = document.querySelector(".selected-option");
	const selectedModel = selectedElement?.textContent.trim();
	const aiModel =
		selectedModel === "Select a model" || !selectedModel
			? "google/gemini-2.0-flash-001"
			: selectedModel;

	try {
		currentUrl = await getCurrentTabUrl();
	} catch (error) {
		console.error("Error getting current tab URL:", error);
		appendMessage("ai", "Could not determine the current page URL.");
		return;
	}

	const isOnSupportedPlatform = supportedPlatforms.some((platform) =>
		currentUrl.includes(platform)
	);
	let pageChatContextForAPI = null; // To store the fetched chat context for the API call

	// Attempt to fetch chat context if on a supported platform and not yet attempted this session
	if (isOnSupportedPlatform && !chatContextAttemptedForThisSession) {
		appendMessage("ai", "Accessing chat messages from the current page..."); // Inform the user
		try {
			const chatMessages = await getChatMessagesFromContentScript();
			if (chatMessages.length === 0) {
				appendMessage(
					"ai",
					"No chat messages found on the page, or I couldn't access them. You can continue the conversation without this context."
				);
			} else {
				const formattedChat = formatChatForAI(chatMessages);
				pageChatContextForAPI = {
					// This system message will be added to the API request
					role: "system",
					content: `Here is the chat history from ${currentUrl}:\n${formattedChat}`,
				};
				appendMessage(
					"ai",
					"I've loaded the chat from the current page to provide context for my responses."
				);
			}
		} catch (error) {
			console.error("Error processing chat messages:", error.message);
			appendMessage(
				"ai",
				`I encountered an issue trying to retrieve chat messages: ${error.message}. Please refresh the page.`
			);
		} finally {
			chatContextAttemptedForThisSession = true; // Mark that an attempt was made
		}
	} else if (
		!isOnSupportedPlatform &&
		!chatContextAttemptedForThisSession &&
		userMessage.toLowerCase().match(/chat|messages|conversation/)
	) {
		// Optional: Inform user if they ask about chat on an unsupported page for the first time
		appendMessage(
			"ai",
			"I can only access chat messages on WhatsApp, Instagram, Telegram, or Messenger. Please navigate to one of these platforms if you want me to analyze a chat."
		);
		chatContextAttemptedForThisSession = true; // Avoid repeating this message for the session
	}

	// Add the user's current message to the ongoing AI-User dialogue history
	messages.push({ role: "user", content: userMessage });

	// Display "Typing..." indicator
	appendMessage("ai", "Typing...");
	let typingBubble = chatWindow.querySelector(
		".chat-bubble.ai.typing-indicator"
	);

	// // API Key Check
	// if (!OPENROUTER_API_KEY) {
	//   if (typingBubble) {
	//       typingBubble.innerHTML = marked.parse("API key is not configured. Please set it in the extension options.");
	//       typingBubble.classList.remove('typing-indicator');
	//       typingBubble.setAttribute("dir", "ltr");
	//   } else {
	//       appendMessage("ai", "API key is not configured. Please set it in the extension options.");
	//   }
	//   messages.pop(); // Remove user message if no API key
	//   chrome.runtime.openOptionsPage();
	//   return;
	// }

	// Prepare the messages array for the API call
	// It starts with a copy of the ongoing AI-User dialogue
	let apiMessagesToSend = [...messages];
	if (pageChatContextForAPI) {
		// If chat context was fetched, insert it after the initial system prompt
		apiMessagesToSend.splice(1, 0, pageChatContextForAPI);
	}

	console.log("Messages being sent to API:", apiMessagesToSend); // For debugging

	try {
		// API call
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: aiModel,
				max_tokens: 1000,
				temperature: 0.7,
				messages: apiMessagesToSend, // Send the potentially augmented message list
			}),
		});

		if (!res.ok) {
			const errorData = await res.json().catch(() => ({})); // Try to parse error, default to empty obj
			const statusText = res.statusText || "Failed to fetch";
			const errorMessage =
				errorData.error?.message ||
				`API request failed with status ${res.status}: ${statusText}`;
			throw new Error(errorMessage);
		}

		const data = await res.json();
		const aiResponse =
			data.choices[0]?.message?.content.trim() ||
			"No response received from AI.";

		// Update chat window with AI's response
		if (typingBubble) {
			typingBubble.innerHTML = marked.parse(aiResponse);
			const rtl = /[\u0600-\u06FF]/.test(aiResponse);
			typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
			typingBubble.classList.remove("typing-indicator");
		} else {
			appendMessage("ai", aiResponse);
		}

		// Add AI's response to the ongoing dialogue history
		messages.push({ role: "assistant", content: aiResponse });
	} catch (err) {
		console.error("Error fetching AI response:", err);
		const errorMessage =
			err.message ||
			"Error: Unable to fetch response. Please check your connection or API key.";
		if (typingBubble) {
			typingBubble.innerHTML = marked.parse(errorMessage);
			const rtl = /[\u0600-\u06FF]/.test(errorMessage); // Check error message for RTL
			typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
			typingBubble.classList.remove("typing-indicator");
		} else {
			appendMessage("ai", errorMessage);
		}
	} finally {
		if (chatWindow) {
			chatWindow.scrollTop = chatWindow.scrollHeight;
		}
	}
}

// Event listener for the send button
sendBtn.addEventListener("click", async () => {
	const userMessage = userPrompt.value.trim();
	if (!userMessage) return;

	appendMessage("user", userMessage);
	userPrompt.value = ""; // Clear the input field

	await handleUserMessage(userMessage);
});

// Allow sending with Enter key, respecting Shift+Enter for new lines
userPrompt.addEventListener("keypress", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault(); // Prevent default Enter behavior (new line)
		sendBtn.click(); // Trigger send button click
	}
});
