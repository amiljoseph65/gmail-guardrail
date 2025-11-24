// Gmail Safety Extension - Content Script

(() => {
    const CONFIG = {
        selectors: {
            // Generic role=button is risky, but Gmail send buttons are usually straightforward
            // We verify text content to be sure.
            button: '[role="button"]',
            // Gmail's subject input name
            subject: 'input[name="subjectbox"]',
            // Body is usually a div with this aria-label or role
            body: 'div[aria-label="Message Body"], div[role="textbox"][aria-label*="Body"]',
            // Attachments usually have aria-label starting with "Attachment:"
            attachment: '[aria-label^="Attachment:"]',
            // The container for the compose window
            composeWindow: 'div[role="dialog"]'
        },
        keywords: ['attachment', 'attached', 'attachments']
    };

    // --- Logic ---

    function getComposeWindow(element) {
        return element.closest(CONFIG.selectors.composeWindow) || element.closest('form');
    }

    function checkContent(composeWindow) {
        // 1. Check Subject
        const subjectInput = composeWindow.querySelector(CONFIG.selectors.subject);
        const subject = subjectInput ? subjectInput.value.trim() : '';
        const isSubjectEmpty = subject === '';

        // 2. Check Body for Keywords
        const bodyEl = composeWindow.querySelector(CONFIG.selectors.body);
        const bodyText = bodyEl ? bodyEl.innerText.toLowerCase() : '';
        const mentionsAttachment = CONFIG.keywords.some(kw => {
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            return regex.test(bodyText);
        });

        // 3. Check for Actual Attachments
        // Query specific attachment chips inside this compose window
        const attachments = composeWindow.querySelectorAll(CONFIG.selectors.attachment);
        const hasAttachments = attachments.length > 0;

        const isAttachmentMissing = mentionsAttachment && !hasAttachments;

        if (isSubjectEmpty && isAttachmentMissing) return 'BOTH_MISSING';
        if (isSubjectEmpty) return 'SUBJECT_MISSING';
        if (isAttachmentMissing) return 'ATTACHMENT_MISSING';

        return 'NONE';
    }

    function handleSendClick(e) {
        const target = e.target;
        const btn = target.closest(CONFIG.selectors.button);

        if (!btn) return;

        // Verify it is a "Send" button
        // Check aria-label (e.g., "Send ‪(⌘Enter)‬") or text content
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text = (btn.innerText || '').toLowerCase();
        
        // Exclude "Schedule send" which is a separate button often next to Send
        if (label.includes('schedule') || text.includes('schedule')) return;
        
        if (!label.includes('send') && !text.includes('send')) return;

        // It is likely the Send button. Find context.
        const composeWindow = getComposeWindow(btn);
        
        // If we can't find the compose window context, we shouldn't block 
        // as we might be outside the compose flow.
        if (!composeWindow) return;

        const warningType = checkContent(composeWindow);

        if (warningType !== 'NONE') {
            // STOP the send
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            showWarningDialog(warningType, () => {
                // On Fix: Try to focus the subject if missing
                if (warningType === 'SUBJECT_MISSING' || warningType === 'BOTH_MISSING') {
                    const subjectInput = composeWindow.querySelector(CONFIG.selectors.subject);
                    if (subjectInput) subjectInput.focus();
                }
            });
        }
    }

    // --- UI ---

    function showWarningDialog(type, onFix) {
        // Remove existing dialog if any
        const existing = document.getElementById('gse-warning-dialog');
        if (existing) existing.remove();

        const titleMap = {
            'SUBJECT_MISSING': 'Missing Subject',
            'ATTACHMENT_MISSING': 'Missing Attachment',
            'BOTH_MISSING': 'Missing Information'
        };

        const messageMap = {
            'SUBJECT_MISSING': 'Please add a subject to your email before sending.',
            'ATTACHMENT_MISSING': 'You mentioned "attachment" in your email, but no files are attached.',
            'BOTH_MISSING': 'Your email is missing a subject and you mentioned an attachment but none are attached.'
        };

        const overlay = document.createElement('div');
        overlay.id = 'gse-warning-dialog';
        overlay.className = 'gse-overlay';

        overlay.innerHTML = `
            <div class="gse-modal">
                <div class="gse-header">
                    <svg class="gse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <h2>${titleMap[type]}</h2>
                </div>
                <div class="gse-body">
                    <p>${messageMap[type]}</p>
                </div>
                <div class="gse-footer">
                    <button class="gse-btn-cancel">Cancel</button>
                    <button class="gse-btn-fix">Fix It</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Handlers
        overlay.querySelector('.gse-btn-cancel').onclick = () => overlay.remove();
        overlay.querySelector('.gse-btn-fix').onclick = () => {
            overlay.remove();
            if (onFix) onFix();
        };
        
        // Close on background click
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    }

    // Use capture phase (true) to intercept the event before Gmail processes it
    document.addEventListener('click', handleSendClick, true);
    
})();