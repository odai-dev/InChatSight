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
    if (!message.timestamp || !message.timestamp.includes(',')) {
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
  // Extract unique authors from incoming messages
  const participants = new Set(
    chat
      .filter(message => message.direction === 'incoming' && message.author) // Only incoming messages with valid authors
      .map(message => message.author)
  );

  // Return the chat partner(s) as a comma-separated string
  return Array.from(participants).join(', ') || 'Unknown';
}

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const userQuestion = document.getElementById("userPrompt").value.trim();
  const responseBox = document.getElementById("responseBox");

  if (!userQuestion) return;

  responseBox.textContent = "Fetching chat messages... 📥";

  try {
    const chatHistory = await getChatMessagesFromContentScript();

    // Identify the chat partner
    const chatPartner = getChatPartner(chatHistory);
    console.log("Chat Partner:", chatPartner);

    const formattedChat = formatChatForAI(chatHistory);

    console.log(formattedChat);

    const messages = [
      {
        role: "system",
        content: `You are a socially intelligent AI assistant embedded in a chat interface. 
      Your role is to provide helpful insights, emotional analysis, or strategic guidance based on chat history.

      The user is currently chatting with: ${chatPartner}.

      You can:
      - Summarize key points from the conversation.
      - Detect emotional tone, interest levels, or intentions.
      - Highlight any red flags, contradictions, or manipulation.
      - Offer advice, reflection, or third-person perspective on the situation.

      Only rely on the messages below. Always back your analysis with examples from the chat.

      Output should be empathetic, neutral, and thoughtful — like a good friend who’s also a therapist.`
    },
      { role: "assistant", content: `CHAT LOG:\n---\n${formattedChat}\n---` },
      { role: "user", content: `USER INSTRUCTION:\n${userQuestion}` },
    ];

    responseBox.textContent = "Analyzing... 🤔";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://inchat.vercel.app", // fake for now
        "X-Title": "InChatSight Extension",
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1",
        max_tokens: 2000,
        temperature: 0.7,
        messages: messages,
      }),
    });

    const data = await res.json();

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      responseBox.textContent = data.choices[0].message.content.trim();
    } else {
      responseBox.textContent = "No valid response received 😕";
    }
  } catch (err) {
    responseBox.textContent = "Error: " + err.message;
  }
});
