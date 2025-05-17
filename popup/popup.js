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

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const userQuestion = document.getElementById("userPrompt").value.trim();
  const responseBox = document.getElementById("responseBox");

  if (!userQuestion) return;

  responseBox.textContent = "Fetching chat messages... 📥";

  try {
    const chatHistoryRaw = await getChatMessagesFromContentScript();

    // Convert raw chatHistory to the message format expected by your AI:
    const chatHistory = chatHistoryRaw.map(msg => ({
      role: msg.direction === "outgoing" ? "user" : "assistant",
      content: `${msg.author}: ${msg.text}`,
    }));

    const messages = [
      {
        role: "system",
        content: `You are a smart assistant that can deeply analyze conversations. 
You have full access to the conversation history, and you can answer *any* question about it.
Be honest, logical, and clear. You can explain:
- The other person's mood, tone, and emotions
- Hidden meanings, contradictions, and intentions
- Whether the person is interested or not
- Any other detail or clue from the chat

Always explain your reasoning in a helpful way.`,
      },
      ...chatHistory,
      { role: "user", content: userQuestion },
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

    if (data.choices && data.choices.length > 0) {
      responseBox.textContent = data.choices[0].message.content.trim();
    } else {
      responseBox.textContent = "No response received 😕";
    }
  } catch (err) {
    responseBox.textContent = "Error: " + err.message;
  }
});
