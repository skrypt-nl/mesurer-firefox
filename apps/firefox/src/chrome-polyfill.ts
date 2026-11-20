// Firefox has neither chrome.offscreen nor chrome.tabCapture, which upstream's recording uses.
// Its MV3 background is an event page with a DOM, so the "offscreen document" is an iframe in
// that page, and the "stream id" is just the tab id: src/offscreen-recording.ts records the tab
// from tabs.captureVisibleTab frames instead of a tab capture stream.

const OFFSCREEN_FRAME_ATTRIBUTE = "data-mesurer-offscreen";

type OffscreenPolyfill = {
  hasDocument: () => Promise<boolean>;
  createDocument: (options: { url: string }) => Promise<void>;
};

type TabCapturePolyfill = {
  getMediaStreamId: (options: { targetTabId?: number }, callback: (streamId: string) => void) => void;
};

const api = chrome as unknown as {
  offscreen?: OffscreenPolyfill;
  tabCapture?: TabCapturePolyfill;
};

if (!api.offscreen) {
  api.offscreen = {
    hasDocument: async () => document.querySelector(`iframe[${OFFSCREEN_FRAME_ATTRIBUTE}]`) !== null,
    createDocument: ({ url }) =>
      new Promise<void>((resolve, reject) => {
        const frame = document.createElement("iframe");
        frame.setAttribute(OFFSCREEN_FRAME_ATTRIBUTE, "");
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error("Could not create the offscreen frame"));
        frame.src = chrome.runtime.getURL(url);
        (document.body ?? document.documentElement).append(frame);
      }),
  };
}

if (!api.tabCapture) {
  api.tabCapture = {
    getMediaStreamId: ({ targetTabId }, callback) => callback(String(targetTabId ?? "")),
  };
}
