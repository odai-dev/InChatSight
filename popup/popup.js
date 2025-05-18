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
Your role is to provide helpful insights, emotional analysis, or strategic guidance based on chat history.

You can:
- Summarize key points from the conversation.
- Detect emotional tone, interest levels, or intentions.
- Highlight any red flags, contradictions, or manipulation.
- Offer advice, reflection, or third-person perspective on the situation.

Only rely on the messages below. Always back your analysis with examples from the chat.

Output should be empathetic, neutral, and thoughtful — like a good friend who’s also a therapist.`
  }
];

let chatLogInjected = false;

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const userQuestion = document.getElementById("userPrompt").value.trim();
  const responseBox = document.getElementById("responseBox");
  responseBox.classList.add("visible");

  if (!userQuestion) return;

  responseBox.textContent = "Fetching chat messages... 📥";

  try {
    if (!chatLogInjected) {
      const chatHistory = await getChatMessagesFromContentScript();
      const chatPartner = getChatPartner(chatHistory);

      // Reset context if user switched chat
      if (chatPartner !== currentChatPartner) {
        currentChatPartner = chatPartner;
        messages = [messages[0]]; // Keep only system prompt
        chatLogInjected = false;
      }

      const formattedChat = formatChatForAI(chatHistory);
      const isGroupChat = currentChatPartner.startsWith("Group Chat:");

      messages.push({
        role: "assistant",
        content: `You're chatting with: ${chatPartner}\n\nCHAT LOG:\n---\n${formattedChat}\n---`
      });

      chatLogInjected = true;
    }

    messages.push({
      role: "user",
      content: `USER INSTRUCTION:\n${userQuestion}`
    });

    responseBox.textContent = "Analyzing... 🤔";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://inchatsight.vercel.app",
        "X-Title": "InChatSight Extension",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-8b-instruct:free",
        max_tokens: 10000,
        temperature: 0.7,
        messages: messages,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      const aiResponse = data.choices[0].message.content.trim();
      responseBox.textContent = aiResponse;

      messages.push({
        role: "assistant",
        content: aiResponse
      });
    } else {
      responseBox.textContent = "No valid response received 😕";
    }

  } catch (err) {
    responseBox.textContent = "Error: " + err.message;
  }
});
