# InChatSight 🔍🤖

**InChatSight** is a Chrome extension designed to revolutionize how you interact with your online chats. By integrating an AI assistant directly into popular messaging platforms like WhatsApp, Messenger, and Instagram, InChatSight allows users to ask deep, analytical questions about their conversations and receive helpful, insightful responses in real time.

Whether you're trying to interpret someone's tone, detect emotional subtext, or gain perspective on a confusing exchange, InChatSight serves as your personal AI-powered conversation analyst—right inside your browser.

---

## 🚀 What the Extension Does

The core functionality of InChatSight is to inject an intelligent assistant into chat interfaces. The assistant can read recent chat messages and respond to user questions like:
- “What is the emotional tone of this conversation?”
- “Does the other person seem interested or distant?”
- “Is there any contradiction in what they’re saying?”
- “What can I infer from the way they’re replying?”

The assistant leverages large language models (via the OpenRouter API) to understand context and extract nuanced insights from the chat. The user can ask questions directly through the popup UI, and get rich answers that help them interpret the conversation with clarity and objectivity.

---

## 📁 Project Structure Overview

Here’s a breakdown of each file and what it contributes to the project:

### `manifest.json`
This is the core configuration file for the Chrome extension. It declares metadata (name, version, permissions), defines which scripts run in which contexts (popup, content, background), and specifies the host permissions needed to access platforms like WhatsApp, Messenger, and Instagram.

Key configuration points:
- `manifest_version`: 3 (required for modern Chrome extensions)
- `permissions`: Includes `activeTab` and `scripting` to inject scripts and communicate with pages
- `host_permissions`: Limits the extension to only run on specific domains
- `content_scripts`: Injects `content.js` into matching pages to extract chat data
- `background`: Declares a `background.js` service worker
- `action`: Points to the popup interface (`popup.html`)

### `background.js`
Currently a placeholder. This file is intended for future scalability—possibly to handle long-running tasks, storage syncing, or listening to tab changes. While not actively used in the MVP, it provides a solid architecture for future updates.

### `content.js`
This script runs in the context of the chat platforms' web pages. It performs the crucial job of **scraping visible chat messages** from the DOM. For WhatsApp, for example, it uses role-based and class-based selectors to extract:
- The direction of the message (incoming/outgoing)
- Author name
- Timestamp
- Message content

These messages are formatted and returned as structured data when the popup sends a request. The code is modular and built to allow similar logic to be added for other platforms like Instagram and Messenger.

### `popup/`
This directory contains all the UI and logic related to the popup interface of the extension—the user's main interaction point.

#### `popup.html`
Defines the layout and structure of the popup interface:
- Title and description
- A text box for user questions
- A button to trigger analysis
- A div for displaying the AI response

#### `popup.css`
Handles basic styling of the popup, keeping the UI clean and readable. Emphasis was placed on clarity and simplicity, keeping distractions minimal while maintaining a friendly tone.

#### `popup.js`
This file is the brains of the popup. It performs several key actions:
1. Collects the user's question when they click "Analyze".
2. Sends a message to `content.js` requesting recent chat history from the current tab.
3. Formats that chat data into a structure understood by the OpenRouter API (ChatGPT-style).
4. Sends a POST request to the AI API with the full conversation + user question.
5. Displays the AI's response in the UI.

It uses Chrome’s `runtime.sendMessage` and `tabs.query` to coordinate with the content script, and provides clear feedback to the user throughout.

#### `config.js`
Holds sensitive or configuration-specific variables like the API key (`OPENROUTER_API_KEY`). This file is separated out to make swapping keys easier and keep logic clean. For safety, this file should be ignored in public repositories (or use environment variable handling in production).

---

## 🤔 Design Decisions & Rationale

### Using OpenRouter over OpenAI
We chose to integrate OpenRouter rather than OpenAI’s direct endpoint to take advantage of a broader selection of models, usage-based pricing, and easier key management. This also opens the door for future LLM swapping or hybrid models.

### Fetching live chat data from content script
Instead of statically hardcoding conversations (like in early prototypes), we decided to dynamically fetch real conversations from the page DOM using content scripts. This required diving into the structure of WhatsApp’s HTML and using appropriate selectors—however, it significantly improved realism and made the tool actually useful.

### System message + chat formatting
Rather than just sending raw chat text to the API, we use a “system prompt” to inform the AI of its role and expectations. This gives it better context and yields more accurate, focused responses. Each chat message is formatted as a role-based entry to preserve tone and order.

### MVP Platform Scope
In this version, WhatsApp is fully supported. The code was designed with scalability in mind—meaning it’s easy to add `grabMessengerMessages()` or `grabInstagramMessages()` functions to extend platform support. This modularity was a deliberate choice.

---

## 🔮 Future Features & Improvements

- Support for Messenger and Instagram DOM structures
- AI summarization of entire chats
- Sentiment heatmaps over time
- Local caching of previous analyses
- Auto-suggestions based on conversation patterns
- Smarter error handling and feedback messages

---

## 🙌 Final Thoughts

InChatSight is a project born from the idea that we often overthink conversations and miss subtle signals. By combining real-time web scraping with powerful LLM analysis, we can bring users a second opinion—one that's clear-headed, objective, and smart.

This README and the project as a whole aim to showcase real-world Chrome extension development, DOM interaction, message passing, and AI API integration. We hope this project inspires you to build creative tools that merge AI with everyday digital experiences.

