import { useEffect } from "react";

interface MouseOpts {
  onScrollUp: () => void;
  onScrollDown: () => void;
  /** row and col are 1-indexed terminal coordinates. */
  onClick: (row: number, col: number) => void;
  onHover: (row: number) => void;
}

// SGR mouse event pattern: \x1b[<Cb;Cx;CyM (press) or ...m (release)
const SGR_MOUSE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

// Button codes in SGR format
const BTN_LEFT = 0;
// SGR motion flag (bit 5). Pure hover = 32+3 = 35; drag with left = 32+0 = 32.
// Both should update the hover row, so we check the bit rather than a single value.
const BTN_MOTION_FLAG = 32;
const BTN_SCROLL_UP = 64;
const BTN_SCROLL_DOWN = 65;

export function useMouse(opts: MouseOpts): void {
  useEffect(() => {
    // Enable: normal click tracking + motion (hover) + SGR extended coords.
    process.stdout.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");

    const handleData = (data: Buffer) => {
      const str = data.toString();
      // Only process mouse sequences — never interfere with keyboard events.
      if (!str.includes("\x1b[<")) return;

      SGR_MOUSE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = SGR_MOUSE.exec(str)) !== null) {
        const btn = parseInt(match[1] ?? "0", 10);
        const col = parseInt(match[2] ?? "0", 10);
        const row = parseInt(match[3] ?? "0", 10);
        const isPress = match[4] === "M";

        if (btn === BTN_SCROLL_UP && isPress) {
          opts.onScrollUp();
        } else if (btn === BTN_SCROLL_DOWN && isPress) {
          opts.onScrollDown();
        } else if (btn === BTN_LEFT && isPress) {
          opts.onClick(row, col);
        } else if ((btn & BTN_MOTION_FLAG) !== 0 && btn < BTN_SCROLL_UP) {
          opts.onHover(row);
        }
      }
    };

    process.stdin.on("data", handleData);

    return () => {
      process.stdin.off("data", handleData);
      process.stdout.write("\x1b[?1006l\x1b[?1003l\x1b[?1000l");
    };
  }, []);
}
