function grabWhatsAppMessages() {
    const rows = document.querySelectorAll('div[role="row"]');
    const msgs = [];
    const authors = new Set();

    rows.forEach(row  => {
        const container = row.querySelector('[data-id]');
        if (!container) return;

        const isOut = !!container.querySelector('.message-out');
        const direction = isOut ? 'outgoing' : 'incoming';

        const textSpan = container.querySelector('span.selectable-text.copyable-text');
        const text =  textSpan?.innerText || '';

        const pre = container.querySelector('.copyable-text')?.getAttribute('data-pre-plain-text') || '';
        const match = pre.match(/^\[(.+?)\]\s*(.*?):\s*$/);
        const timestamp = match ? match[1] : '';
        const author = match ? match[2] : (isOut ? 'You' : '');

        if (author) authors.add(author);

        msgs.push({direction, author, timestamp, text});
    });

    const isGroupChat = authors.size > 1; // Infer group chat if there are multiple unique authors
    return { messages: msgs, isGroupChat };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getChatMessages') {
        try {
            const { messages, isGroupChat } = grabWhatsAppMessages();
            sendResponse({ messages, isGroupChat });
        } catch (error) {
            console.error('Error grabbing WhatsApp messages:', error);
            sendResponse({ error: 'Failed to retrieve messages' });
        }
    }
    return true; // Ensure the sendResponse is kept alive for asynchronous responses
});

