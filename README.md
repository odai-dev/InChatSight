# InChatSight: AI-Powered Chat Companion

#### Video Demo: <>
#### Description:

InChatSight is a Chrome browser extension designed to enhance your online chat experiences by integrating an intelligent AI assistant. Currently, it excels at interacting with WhatsApp Web, where it can access the current conversation (with user initiation via the popup) to provide valuable insights, summaries, emotional tone analysis, or even strategic communication advice. Support for other popular platforms like Facebook Messenger, Instagram, and Telegram is planned for future development. The extension allows users to interact with a powerful AI model (configurable via OpenRouter API) that uses the context of the ongoing chat to offer relevant and helpful responses. Even when not on a supported chat platform, or when full context-extraction for other platforms is pending, InChatSight functions as a general-purpose AI chatbot within its popup interface, remembering your conversation history across sessions. The goal is to provide users with a "second brain" or an insightful friend who can offer a different perspective on their digital interactions, helping them communicate more effectively and understand conversations better.

## Technologies Used

*   **JavaScript (ES6+):** Core logic for the extension, including DOM manipulation, API interactions, and event handling.
*   **HTML5 & CSS3:** Structure and styling for the extension's popup interface and setup page.
*   **Chrome Extension APIs:**
    *   `chrome.storage.local`: For persisting the user's API key and chat history.
    *   `chrome.tabs`: For managing the setup page and interacting with the active tab.
    *   `chrome.runtime`: For inter-script communication (popup to content script) and handling installation events.
    *   `chrome.action`: For defining the browser action (popup).
*   **OpenRouter API:** Used to access various large language models for the AI's conversational capabilities. Users provide their own OpenRouter API key.
*   **Marked.js:** A JavaScript library used to parse and render Markdown in the AI's responses, allowing for richer text formatting.

## Features

*   **Contextual Chat Analysis (WhatsApp Web):** On WhatsApp Web, the extension can fetch the current chat messages to provide context-aware AI insights. Support for comprehensive message extraction on Facebook Messenger, Instagram, and Telegram is a planned future enhancement.
*   **AI Chatbot Interface:** A clean, modern, and interactive popup window with a dark theme for conversing with the AI.
*   **Persistent Chat History:** Conversations with the AI within the popup are saved locally and restored across sessions.
*   **OpenRouter API Key Setup:** A dedicated setup page with a clear interface guides users to input their OpenRouter API key on first installation.
*   **Model Selection:** Users can choose their preferred AI model from a custom-styled dropdown list in the popup (models sourced from OpenRouter).
*   **Dynamic System Prompts:** The AI's underlying instructions (system prompt) change based on whether it has access to page chat context, tailoring its responses.
*   **Session-Specific Page Context:** Chat context grabbed from WhatsApp Web is used for the current popup session to inform the AI but is not permanently stored in the AI's chat log.
*   **Markdown Rendering:** AI responses are rendered with Markdown support for better readability (e.g., lists, bolding, links).
*   **"Typing..." Indicator:** Provides animated visual feedback while the AI is processing a response.
*   **Reset Chat Functionality:** Allows users to clear the current conversation history with the AI.
*   **Automatic Setup Page:** Opens the API key setup page upon first installation.

## Setup and Installation

1.  **Download/Clone the Repository:**
    *   Obtain the extension files and place them in a local directory.
2.  **Enable Developer Mode in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Toggle on "Developer mode" in the top right corner.
3.  **Load Unpacked Extension:**
    *   Click on "Load unpacked."
    *   Select the directory where you saved the `InChatSight` extension files (the directory containing `manifest.json`).
4.  **API Key Setup:**
    *   Upon first installation, a setup page (`setup/setup.html`) should automatically open.
    *   If it doesn't, you can usually access it via the extension's options (if configured, or by finding its URL in `chrome://extensions` details and opening it manually).
    *   Enter your OpenRouter API key in the input field and click "Save." The tab will close automatically after saving. You can get an API key from [OpenRouter.ai](https://openrouter.ai/settings/keys).

## How to Use

1.  **Open the Extension:** Click the InChatSight icon in your Chrome toolbar. This will open the popup interface.
2.  **Chat with the AI:** Type your message in the textarea at the bottom of the popup and press Enter or click the "Send" button.
3.  **Contextual Analysis (on supported platforms):**
    *   Navigate to a chat on **WhatsApp Web**. For other platforms like Messenger, Instagram, or Telegram, the AI will currently function as a general chatbot without specific page message extraction, pending future updates.
    *   Open the InChatSight popup.
    *   **If on WhatsApp Web,** the extension will attempt to access the messages from the current page. It will notify you if it successfully loaded context or if there was an issue.
    *   You can then ask the AI questions about the conversation, request summaries, analyze tone, etc. The AI will use the fetched chat as context.
4.  **Select AI Model:** Use the dropdown menu (styled as "Select AI model") at the top of the popup to choose a different AI model for your conversation. The list includes various models from OpenAI, Google, Meta, DeepSeek, and Anthropic.
5.  **Reset Chat:** Click the "Reset Chat" button located next to the model selector to clear the current conversation history with the AI in the popup.

## Project Structure and File Explanations


InChatSight/
├── README.md # This documentation file
├── background.js # Service worker for background tasks
├── content.js # Injects into web pages to grab chat data
├── icons/ # Extension icons (icon.png used as chat background)
│ ├── icon-16.png
│ ├── icon-32.png
│ ├── icon-48.png
│ └── icon-128.png
├── libs/
│ └── marked.min.js # Markdown parsing library
├── manifest.json # Core configuration file for the extension
├── popup/
│ ├── popup.css # Styles for the popup interface
│ ├── popup.html # HTML structure for the popup
│ └── popup.js # JavaScript logic for the popup interface
└── setup/
├── setup.html # HTML for the API key setup page
└── setup.js # JavaScript logic for the setup page

*   **`manifest.json`**:
    *   Defines the extension's name ("InChatSight"), version, description, and icons.
    *   Specifies `manifest_version: 3`.
    *   **Permissions**: `activeTab`, `scripting`, `storage`, `tabs`.
    *   **Host Permissions**: `"*://*.whatsapp.com/*"`, `"*://*.messenger.com/*"`, `"*://*.instagram.com/*"`, `"*://*.telegram.org/*"`. Also includes `https://openrouter.ai/*` in content script matches, though its primary interaction with OpenRouter is via API calls from `popup.js`.
    *   **Action**: Defines `popup/popup.html` as the default UI.
    *   **Options Page**: Sets `setup/setup.html` as the options page.
    *   **Background Script**: Registers `background.js` as the service worker.
    *   **Content Scripts**: Declares `content.js` to be injected into matched URLs when the document is idle.

*   **`background.js`**:
    *   Handles the `chrome.runtime.onInstalled` event.
    *   On first install, it opens `setup/setup.html` for API key entry.

*   **`content.js`**:
    *   Injected into supported chat platforms (WhatsApp, Messenger, Instagram, Telegram).
    *   `grabWhatsAppMessages()`: **Currently implemented to parse WhatsApp Web's DOM.** It extracts message text, author, timestamp, and direction.
        *   *Limitation*: Tightly coupled to WhatsApp's HTML. Parsers for other platforms are future work.
    *   `chrome.runtime.onMessage.addListener()`: Listens for `action: "getChatMessages"` from `popup.js`, calls `grabWhatsAppMessages()`, and returns the data.

*   **`libs/marked.min.js`**:
    *   A third-party Markdown parsing library used in `popup.js` to render AI responses with rich formatting (lists, bolding, etc.).

*   **`popup/popup.html`**:
    *   Defines the structure of the extension's main user interface.
    *   Key elements include:
        *   `<div id="chatWindow">`: The scrollable area where user and AI messages are displayed.
        *   A custom dropdown (`<div class="custom-select">`) for AI model selection, listing various models from providers like OpenAI, Google, Meta, etc.
        *   `<button id="resetBtn">`: Allows users to clear the chat history.
        *   A chat input area (`<div class="chat-input-container">`) containing:
            *   `<textarea id="userPrompt">`: For users to type their messages.
            *   `<button id="sendBtn">`: To submit the message.
    *   Includes `popup.css` for styling and `../libs/marked.min.js` and `popup.js` for functionality.

*   **`popup/popup.css`**:
    *   Provides the visual styling for `popup.html`, creating a modern, dark-themed chat interface.
    *   Uses CSS custom properties (variables like `--primary`, `--bg`, `--text`) for a consistent theme.
    *   Styles chat bubbles for user and AI messages, the input area, buttons, and the custom model selector dropdown.
    *   Includes animations for the "typing..." indicator (`pulseDots`) and message appearance (`typingFadeIn`).
    *   The chat window (`.chat-window`) has a subtle background image (`icons/icon.png`).

*   **`popup/popup.js`**:
    *   The core JavaScript for the popup interface.
    *   **State Management**: Manages `messages` (chat history), `OPENROUTER_API_KEY`, and session-specific flags for page context using `chrome.storage.local`.
    *   **Initialization**: On `DOMContentLoaded`, loads API key, prior chat state, sets up the model selector, and attaches event listeners.
    *   **`resetChat()`**: Clears chat history and UI.
    *   **`getChatMessagesFromContentScript()`**: Communicates with `content.js` to fetch chat data from the active tab.
    *   **`formatChatForAI()`**: Prepares scraped chat messages for the AI.
    *   **System Prompts**: Defines `chatAnalyzerSystemPrompt` and `defaultSystemPrompt`.
    *   **`appendMessage()`**: Dynamically adds messages to `chatWindow`, using `marked.parse()` for AI responses.
    *   **`handleUserMessage()`**: Orchestrates fetching page context (if applicable), constructing the API request with system prompts and message history, calling the OpenRouter API, and displaying the AI's response.

*   **`setup/setup.html`**:
    *   The HTML page for users to enter their OpenRouter API key.
    *   Consists of a title, an `<input type="password" id="apiKeyInput">` for the key, a `<button id="saveBtn">`, a link to OpenRouter's key settings page, and a `<p id="status">` for feedback messages.
    *   Styling is primarily handled by an inline `<style>` block, featuring a dark theme consistent with the popup.

*   **`setup/setup.js`**:
    *   Provides the functionality for `setup.html`.
    *   Adds an event listener to `saveBtn`. On click, it retrieves the API key from `apiKeyInput`, saves it to `chrome.storage.local`, displays a status message, and then closes the setup tab.

## Design Choices and Rationale

*   **OpenRouter for Model Flexibility**: Allows users to choose from various AI models via their own API key, offloading API management to the user.
*   **Session-Based Page Context**: Page-scraped chat context is temporary for the current session to keep the main AI conversation log clean.
*   **Platform-Specific DOM Parsing (WhatsApp Focus)**: Current message extraction targets WhatsApp for accuracy, with plans to expand to other platforms. This approach is more reliable than generic scrapers but requires platform-specific code.
*   **`chrome.storage.local` for Persistence**: Standard and secure method for storing API keys and chat history.
*   **Client-Side API Key Handling**: Simplifies architecture by keeping the API key on the client, relying on user trust.
*   **Asynchronous Operations (`async/await`)**: Ensures a responsive UI during API calls and storage operations.
*   **User-Initiated Context Fetching**: Respects privacy by only fetching page chat data when the popup is opened on a supported site.
*   **Clear User Feedback & UI**: The popup uses a dark theme, clear visual cues like "Typing...", and informative messages. The setup page is straightforward.
*   **Markdown for AI Responses**: `marked.js` enhances AI response readability.
*   **Custom CSS Theming**: Using CSS variables (`:root`) in `popup.css` and `setup.html` (inline styles) allows for easy theming and consistent design.

## Challenges and Potential Future Work

*   **DOM Scraping Fragility**: The `grabWhatsAppMessages` function is vulnerable to WhatsApp UI changes. This will be a recurring challenge as support for other platforms is added.
*   **Support for More Platforms**: A primary goal is to implement robust message extraction for Facebook Messenger, Instagram, and Telegram, requiring dedicated parsers.
*   **Context Window Limitations**: Long chat histories might exceed AI model limits. Future work could involve summarization or more selective context.
*   **Error Handling**: Enhancing resilience against API errors and content script issues.
*   **Advanced AI Features**: User-customizable prompts, more specialized analysis tasks.
*   **UI/UX Enhancements**: Options for editing/deleting messages, clearer indication of loaded context, improved accessibility.
*   **Performance on Large Chats**: Optimizing the extraction and processing of extensive chat histories.

---

This was CS50x! 😊

Note: this READEM.md file was written with the help of Gimini ai.