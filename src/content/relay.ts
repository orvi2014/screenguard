import type { Message } from '../shared/types';
import { showConfirmDialog } from './clickInterceptor';
import { revealAllLocally, reportSensitiveCount, setForeignSensitiveCounts } from './sensitiveDetector';
import { isTopFrame } from './frame';

/**
 * Cross-frame plumbing.
 *
 * Frames in the same tab cannot talk to each other directly when they are
 * cross-origin, so everything goes through the background worker. The top frame
 * owns the visible UI (dialogs, the "items hidden" indicator) and embedded
 * frames delegate to it.
 */
export function startRelay(): void {
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    switch (message.type) {
      case 'SHOW_DIALOG': {
        if (!isTopFrame()) return false;
        showConfirmDialog(message.payload.url, message.payload.verdict)
          .then((choice) => sendResponse({ choice }))
          .catch(() => sendResponse({ choice: 'back' }));
        return true; // respond asynchronously
      }

      case 'FRAME_SENSITIVE_COUNT': {
        if (!isTopFrame()) return false;
        setForeignSensitiveCounts(message.frameId, message.counts);
        return false;
      }

      case 'REVEAL_IN_FRAME': {
        if (isTopFrame()) return false;
        revealAllLocally();
        return false;
      }

      case 'REQUEST_SENSITIVE_COUNTS': {
        if (isTopFrame()) return false;
        reportSensitiveCount();
        return false;
      }

      case 'GET_FRAME_URL': {
        // Answers "what page am I on?" for the popup. Only the top frame
        // replies, and only about itself — which is the page the user is
        // already looking at.
        if (!isTopFrame()) return false;
        sendResponse({ url: window.location.href });
        return false;
      }

      default:
        return false;
    }
  });
}
