// Firefox background entry: polyfill the Chrome-only APIs upstream's background uses, then run
// upstream's background unchanged. Import order matters: the polyfill must evaluate first.
import "./chrome-polyfill";
import "../../extension/src/background";
