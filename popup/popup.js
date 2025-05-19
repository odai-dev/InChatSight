// Initialize custom dropdown functionality
document.addEventListener('DOMContentLoaded', () => {
  const customSelect = document.querySelector('.custom-select');
  const selectedOption = customSelect.querySelector('.selected-option');
  const optionsContainer = customSelect.querySelector('.options-container');
  const options = customSelect.querySelectorAll('.option');

  // Toggle dropdown open/close on click
  selectedOption.addEventListener('click', () => {
    customSelect.classList.toggle('open');
  });

  // Update selected option and close dropdown
  options.forEach(option => {
    option.addEventListener('click', () => {
      selectedOption.textContent = option.textContent;
      customSelect.classList.remove('open');
      console.log("Selected model:", option.textContent);
    });
  });

  // Close dropdown if clicked outside
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      customSelect.classList.remove('open');
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
      chrome.tabs.sendMessage(tabs[0].id, { action: "getChatMessages" }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError.message);
        }
        resolve(response?.messages || []);
      });
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
  return chat.map(message => {
    if (!message.timestamp || typeof message.timestamp !== 'string' || !message.timestamp.includes(',')) {
      console.warn("Invalid or missing timestamp:", message);
      return `${message.author || 'Unknown'}: ${message.text || '[No text provided]'}`;
    }

    const [timePart, datePart] = message.timestamp.split(',');
    const formattedDate = formatDate(datePart.trim());
    const formattedTime = formatTime(timePart.trim());

    return `${message.author || 'Unknown'} [${formattedDate}, ${formattedTime}]: ${message.text || '[No text provided]'}`;
  }).join('\n');
}

// Format date into a readable format
function formatDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

// Format time to uppercase (AM/PM)
function formatTime(timeStr) {
  return timeStr.toUpperCase();
}

// Identify the chat partner from incoming messages
function getChatPartner(chat) {
  const participants = new Set(
    chat
      .filter(msg => msg.direction === 'incoming' && msg.author)
      .map(msg => msg.author)
  );

  const names = Array.from(participants);
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return names[0];
  return `Group Chat: ${names.join(', ')}`;
}

let currentChatPartner = null;

// Initialize system message for AI context
let messages = [
  {
    role: "system",
    content: `You are a socially intelligent AI assistant embedded in a chat interface.
Your role is to provide helpful insights, emotional analysis, or strategic guidance based on chat
You can:
- Summarize key points from the conversation.
- Detect emotional tone, interest levels, or intentions.
- Highlight any red flags, contradictions, or manipulation.
- Offer advice, reflection, or third-person perspective on the situation.
- respond with the language that user sent his latest message with to you with eg: English, arabic etc.. .
- format, orgnize and style your respone with new lines . 
Only rely on the messages below. Always back your analysis with examples from the chat if it was provided.
Output should be empathetic, neutral, and thoughtful — like a good friend who's also a therapist.`
  }
];

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
    bubble.classList.add('typing-indicator');
    bubble.innerHTML = "<div class='dots-container'><span></span><span></span><span></span></div>";
    bubble.setAttribute("dir", "ltr");
  } else {
    const isRtl = /[\u0600-\u06FF]/.test(content);
    bubble.setAttribute("dir", isRtl ? "rtl" : "ltr");

    if (role === "ai") {
      bubble.innerHTML = marked.parse(content);
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
  // Define supported platforms for chat analysis
  const supportedPlatforms = ["whatsapp.com", "instagram.com", "telegram.org", "messenger.com"];
  let currentUrl = '';
  // determine the selected ai model
   const selectedElement = document.querySelector(".selected-option");
  const selectedModel = selectedElement?.textContent.trim();
  const aiModel = (selectedModel === "Select a model" || !selectedModel) ? "google/gemini-2.0-flash-001": selectedModel;

  try {
    // Get the current tab's URL
    currentUrl = await getCurrentTabUrl();
  } catch (error) {
    console.error("Error getting current tab URL:", error);
    appendMessage("ai", "Could not determine the current page URL.");
    return;
  }

  // Check if the current platform is supported
  const isOnSupportedPlatform = supportedPlatforms.some((platform) => currentUrl.includes(platform));

  // Handle chat-related user requests
  if (userMessage.toLowerCase().includes("chat") || userMessage.toLowerCase().includes("messages")) {
    if (!isOnSupportedPlatform) {
      // Inform the user if the platform is not supported
      appendMessage("ai", "I can only access chat messages on WhatsApp, Instagram, Telegram, or Messenger. Please navigate to one of these platforms.");
    } else {
      try {
        // Fetch chat messages from the content script
        const chatMessages = await getChatMessagesFromContentScript();
        if (chatMessages.length === 0) {
          // Inform the user if no chat messages were retrieved
          appendMessage("ai", "I couldn't retrieve any chat messages. If you're on the correct platform, please refresh the page and try again.");
        } else {
          // Format and include chat history in the AI context
          const formattedChat = formatChatForAI(chatMessages);
          messages.push({
            role: "system",
            content: `Here is the chat history from ${currentUrl}:\n${formattedChat}`
          });
          appendMessage("ai", "Okay, I've included the chat history in our context.");
        }
      } catch (error) {
        console.error("Error processing chat messages:", error);
        appendMessage("ai", "I encountered an issue trying to retrieve or process chat messages. Please ensure you're on a supported chat page and try refreshing.");
      }
    }
  }

  // Add the user's message to the context
  messages.push({ role: "user", content: userMessage });

  // Display a "Typing..." indicator for the AI response
  appendMessage("ai", "Typing...");

  // Get the bubble element for the "Typing..." indicator
  let typingBubble = chatWindow.querySelector('.chat-bubble.ai.typing-indicator');

  // Check if the API key is available
  if (!OPENROUTER_API_KEY) {
    if (typingBubble) {
        // Update the "Typing..." bubble with an error message
        typingBubble.innerHTML = marked.parse("API key is not configured. Please set it in the extension options.");
        typingBubble.classList.remove('typing-indicator');
        typingBubble.setAttribute("dir", "ltr");
    } else {
        appendMessage("ai", "API key is not configured. Please set it in the extension options.");
    }
    messages.pop(); // Remove the user's message from the context
    chrome.runtime.openOptionsPage(); // Open the options page for API key configuration
    return;
  }

  try {
    // Send the user's message and context to the AI API
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: aiModel,
        max_tokens: 1000,
        temperature: 0.7,
        messages: messages
      })
    });

    // Handle non-successful API responses
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const statusText = res.statusText || "Failed to fetch";
        const errorMessage = errorData.error?.message || `API request failed with status ${res.status}: ${statusText}`;
        throw new Error(errorMessage);
    }

    // Parse the AI's response
    const data = await res.json();
    const aiResponse = data.choices[0]?.message?.content.trim() || "No response received from AI.";

    if (typingBubble) {
      // Update the "Typing..." bubble with the AI's response
      typingBubble.innerHTML = marked.parse(aiResponse);
      const rtl = /[\u0600-\u06FF]/.test(aiResponse);
      typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
      typingBubble.classList.remove('typing-indicator');
    } else {
      // Append the AI's response if the "Typing..." bubble is not found
      appendMessage("ai", aiResponse);
    }
    
    // Add the AI's response to the context
    messages.push({ role: "assistant", content: aiResponse });

  } catch (err) {
    console.error("Error fetching AI response:", err);
    const errorMessage = err.message || "Error: Unable to fetch response. Please check your connection or API key.";
    if (typingBubble) {
      // Update the "Typing..." bubble with the error message
      typingBubble.innerHTML = marked.parse(errorMessage);
      const rtl = /[\u0600-\u06FF]/.test(errorMessage);
      typingBubble.setAttribute("dir", rtl ? "rtl" : "ltr");
      typingBubble.classList.remove('typing-indicator');
    } else {
      // Append the error message if the "Typing..." bubble is not found
      appendMessage("ai", errorMessage);
    }
  } finally {
    // Ensure the chat window scrolls to the bottom after updates
    if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  }
}

// Add event listener to send button
sendBtn.addEventListener("click", async () => {
  const userMessage = userPrompt.value.trim();
  if (!userMessage) return;

  appendMessage("user", userMessage);
  userPrompt.value = "";

  await handleUserMessage(userMessage);
});
