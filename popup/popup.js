// Custom dropdown
document.addEventListener('DOMContentLoaded', () => {
  const customSelect = document.querySelector('.custom-select');
  const selectedOption = customSelect.querySelector('.selected-option');
  const optionsContainer = customSelect.querySelector('.options-container');
  const options = customSelect.querySelectorAll('.option');

  // Toggle dropdown
  selectedOption.addEventListener('click', () => {
    customSelect.classList.toggle('open');
  });

  // Select an option and close
  options.forEach(option => {
    option.addEventListener('click', () => {
      selectedOption.textContent = option.textContent;
      customSelect.classList.remove('open');
      console.log("Selected model:", option.textContent); // Add logic here if needed
    });
  });

  // Close if clicked outside
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      customSelect.classList.remove('open');
    }
  });
});


// 
let OPENROUTER_API_KEY = null;

chrome.storage.local.get("apiKey", (data) => {
    OPENROUTER_API_KEY = data.apiKey; // Ensure 'apiKey' matches the key used in setup.js
    if (!OPENROUTER_API_KEY) {
        chrome.runtime.openOptionsPage();
    }
});

let selectedElement = document.querySelector(".selected-option");
let aiModel = (selectedElement?.textContent.trim() === "Select a model") ? "google/gemini-2.0-flash-001" : selectedElement.textContent.trim();


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

async function getCurrentTabUrl() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url) return reject("No active tab URL found");
      resolve(tabs[0].url);
    });
  });
}

function formatChatForAI(chat) {
  return chat.map(message => {
    if (!message.timestamp || typeof message.timestamp !== 'string' || !message.timestamp.includes(',')) {
      console.warn("Invalid or missing timestamp:", message);
      return `${message.author || 'Unknown'}: ${message.text || '[No text provided]'}`; // Fallback format
    }

    // Split timestamp into time and date
    const [timePart, datePart] = message.timestamp.split(',');
    const formattedDate = formatDate(datePart.trim());
    const formattedTime = formatTime(timePart.trim());

    return `${message.author || 'Unknown'} [${formattedDate}, ${formattedTime}]: ${message.text || '[No text provided]'}`;
  }).join('\n');
}

function formatDate(dateStr) {
  // Assumes format: dd/mm/yyyy
  const [day, month, year] = dateStr.split('/');
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

function formatTime(timeStr) {
  // Just make sure it's uppercase PM/AM 
  return timeStr.toUpperCase();
}

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

function appendMessage(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;

  const bubble = document.createElement("div");  // <---- Make sure to declare this!
  bubble.className = `chat-bubble ${role}`;

  // Detect direction (RTL or LTR)
  const rtl = /[\u0600-\u06FF]/.test(content);
  bubble.setAttribute("dir", rtl ? "rtl" : "ltr");

  // Use marked to parse markdown for AI messages only
  if (role === "ai") {
    bubble.innerHTML = marked.parse(content);
  } else {
    // For user messages or others, preserve line breaks as plain text
    bubble.innerHTML = content.replace(/\n/g, "<br>");
  }

  messageDiv.appendChild(bubble);
  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}


async function handleUserMessage(userMessage) {
  const supportedPlatforms = ["whatsapp.com", "instagram.com", "telegram.org", "messenger.com"];
  const currentUrl = await getCurrentTabUrl();
  const isOnSupportedPlatform = supportedPlatforms.some((platform) => currentUrl.includes(platform));

  if (userMessage.toLowerCase().includes("chat") || userMessage.toLowerCase().includes("messages")) {
    if (!isOnSupportedPlatform) {
      appendMessage("ai", "I can only access chat messages on WhatsApp, Instagram, Telegram, or Messenger. Please navigate to one of these platforms.");
      return;
    }


    try {
      const chatMessages = await getChatMessagesFromContentScript();
      if (chatMessages.length === 0) {
        appendMessage("ai", "I couldn't retrieve any chat messages. If you're on the correct platform, please refresh the page and try again.");
        return;
      }

      const formattedChat = formatChatForAI(chatMessages);
      messages.push({
        role: "system",
        content: `Here is the chat history:\n${formattedChat}`
      });
    } catch (error) {
      appendMessage("ai", "I couldn't retrieve chat messages. Please refresh the page and try again.");
      return;
    }
  }

  // Normal AI behavior
  messages.push({ role: "user", content: userMessage });
  appendMessage("ai", "Typing...");
  
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, // Use the retrieved API key
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `${aiModel}`,
        max_tokens: 1000,
        temperature: 0.7,
        messages: messages
      })
    });

    
    const data = await res.json();
    const aiResponse = data.choices[0]?.message?.content.trim() || "No response.";
    appendMessage("ai", aiResponse);

    messages.push({ role: "assistant", content: aiResponse });
  } catch (err) {
    appendMessage("ai", "Error: Unable to fetch response.");
  }
}

sendBtn.addEventListener("click", async () => {
  const userMessage = userPrompt.value.trim();
  if (!userMessage) return;

  appendMessage("user", userMessage);
  userPrompt.value = "";

  await handleUserMessage(userMessage);
});
