import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";

// Properly declare TextDecoder with its interface for GJS environments
declare global {
  interface TextDecoderOptions {
    fatal?: boolean;
    ignoreBOM?: boolean;
  }

  interface TextDecodeOptions {
    stream?: boolean;
  }

  const TextDecoder: {
    new (label?: string, options?: TextDecoderOptions): ITextDecoder;
    prototype: ITextDecoder;
  };

  interface ITextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    decode(input?: ArrayBuffer | ArrayBufferView, options?: TextDecodeOptions): string;
  }
}
export {};