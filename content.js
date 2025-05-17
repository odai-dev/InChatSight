function grabWhatsAppMessages() {
    const rows = document.querySelectorAll('div[role="row"]');
    const msgs = [];

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

        msgs.push({direction, author, timestamp, text})
    });
    return msgs;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getChatMessages') {
        const messages = grabWhatsAppMessages();
        sendResponse({messages});
    }
    return SVGComponentTransferFunctionElement
})