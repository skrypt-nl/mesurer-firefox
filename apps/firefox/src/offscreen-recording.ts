// Firefox replacement for upstream's src/offscreen-recording.ts. Speaks the same messages, but
// Firefox has no tab capture stream, so frames come from tabs.captureVisibleTab, are cropped onto
// a canvas, and the canvas is recorded. Runs in an iframe inside the background event page
// (see src/chrome-polyfill.ts); saved recordings land in upstream's recording-db, where upstream's
// recording player reads them.
import { tabCaptureRectToVideoCrop } from "../../../packages/mesurer/core/screen-recording";
import {
  OFFSCREEN_RECORDING_ABORT_MESSAGE,
  OFFSCREEN_RECORDING_PREPARE_MESSAGE,
  OFFSCREEN_RECORDING_START_MESSAGE,
  OFFSCREEN_RECORDING_STOP_MESSAGE,
  RECORDING_PREPARED_MESSAGE,
  RECORDING_READY_MESSAGE,
  RECORDING_STARTED_MESSAGE,
} from "../../extension/src/messages";
import { saveRecording } from "../../extension/src/recording-db";

const FRAME_INTERVAL_MS = 1000 / 30;
// An event page is suspended after ~30s without events, and a recording may run 60s.
const KEEPALIVE_INTERVAL_MS = 10_000;
const KEEPALIVE_MESSAGE = "mesurer:firefox-keepalive";

type Rect = { left: number; top: number; width: number; height: number };
type Viewport = { width: number; height: number };
type Target = { tabId: number; windowId: number };
type Session = Target & {
  recorder: MediaRecorder;
  output: MediaStream;
  chunks: Blob[];
  startedAt: number;
  keepalive: number;
};

let prepared: Target | null = null;
let session: Session | null = null;
let startupId = 0;

const send = (message: Record<string, unknown>) => {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Recording failed");

const captureFrame = async (windowId: number) => {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 92 });
  return createImageBitmap(await (await fetch(dataUrl)).blob());
};

const isTabVisible = async ({ tabId, windowId }: Target) => {
  const [active] = await chrome.tabs.query({ active: true, windowId });
  return active?.id === tabId;
};

const release = (current: Session) => {
  clearInterval(current.keepalive);
  current.output.getTracks().forEach((track) => track.stop());
};

const prepare = (tabId: number) => {
  const currentStartupId = ++startupId;
  prepared = null;
  void chrome.tabs
    .get(tabId)
    .then(async (tab) => {
      // Fail before the region is chosen, not after, when this tab cannot be captured.
      (await captureFrame(tab.windowId)).close();
      if (currentStartupId !== startupId) return;
      prepared = { tabId, windowId: tab.windowId };
      send({ type: RECORDING_PREPARED_MESSAGE, tabId });
    })
    .catch((error) => {
      if (currentStartupId === startupId) send({ type: RECORDING_PREPARED_MESSAGE, tabId, error: errorMessage(error) });
    });
};

const start = async (tabId: number, rect: Rect, viewport: Viewport) => {
  const target = prepared;
  prepared = null;
  if (!target || target.tabId !== tabId) throw new Error("Recording capture was not prepared");

  const first = await captureFrame(target.windowId);
  const { sx, sy, sw, sh } = tabCaptureRectToVideoCrop(rect, first.width, first.height, viewport);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  document.body.append(canvas);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Recording is unavailable");

  // Frame rate 0: a frame is taken only when one is requested, i.e. once per captured frame.
  // Firefox has requestFrame() on the stream; the spec (and Chrome) on the track.
  const output = canvas.captureStream(0) as MediaStream & { requestFrame?: () => void };
  const track = output.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const requestFrame = () => (output.requestFrame ? output.requestFrame() : track.requestFrame?.());
  const paint = (frame: ImageBitmap) => {
    context.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
    frame.close();
    requestFrame();
  };
  paint(first);

  const recorder = new MediaRecorder(output, { mimeType: "video/webm" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
  const current: Session = {
    ...target,
    recorder,
    output,
    chunks,
    startedAt: performance.now(),
    keepalive: window.setInterval(() => send({ type: KEEPALIVE_MESSAGE }), KEEPALIVE_INTERVAL_MS),
  };
  session = current;
  recorder.start(250);

  void (async () => {
    while (session === current) {
      const frameStart = performance.now();
      try {
        // captureVisibleTab takes whatever tab is in front: skip frames while another one is.
        if (await isTabVisible(current)) {
          const frame = await captureFrame(current.windowId);
          if (session === current) paint(frame);
          else frame.close();
        }
      } catch {
        // A frame may fail mid-navigation; keep the previous one.
      }
      const wait = FRAME_INTERVAL_MS - (performance.now() - frameStart);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    canvas.remove();
  })();
};

const stop = async () => {
  if (!session) throw new Error("No recording in progress");
  const current = session;
  session = null;
  let blob: Blob;
  try {
    blob = await new Promise<Blob>((resolve, reject) => {
      current.recorder.onstop = () => resolve(new Blob(current.chunks, { type: current.recorder.mimeType || "video/webm" }));
      current.recorder.onerror = () => reject(new Error("Recording failed"));
      if (current.recorder.state === "recording") current.recorder.stop();
      else resolve(new Blob(current.chunks, { type: "video/webm" }));
    });
  } finally {
    release(current);
  }
  const id = crypto.randomUUID();
  await saveRecording(id, blob);
  const duration = Math.max(0.1, (performance.now() - current.startedAt) / 1000);
  send({ type: RECORDING_READY_MESSAGE, id, tabId: current.tabId, duration });
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === OFFSCREEN_RECORDING_PREPARE_MESSAGE) {
    prepare(message.tabId);
  } else if (message?.type === OFFSCREEN_RECORDING_START_MESSAGE) {
    void start(message.tabId, message.rect, message.viewport).then(
      () => send({ type: RECORDING_STARTED_MESSAGE, tabId: message.tabId }),
      (error) => send({ type: RECORDING_STARTED_MESSAGE, tabId: message.tabId, error: errorMessage(error) }),
    );
  } else if (message?.type === OFFSCREEN_RECORDING_STOP_MESSAGE) {
    const tabId = session?.tabId;
    void stop().catch((error) => send({ type: RECORDING_READY_MESSAGE, tabId, error: errorMessage(error) }));
  } else if (message?.type === OFFSCREEN_RECORDING_ABORT_MESSAGE) {
    startupId += 1;
    prepared = null;
    if (session) {
      const current = session;
      session = null;
      if (current.recorder.state === "recording") current.recorder.stop();
      release(current);
    }
  }
});
