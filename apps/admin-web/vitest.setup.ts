import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement <dialog>.showModal/close yet; polyfill with the `open` attribute.
// (Skipped in node-environment test files, where there is no DOM.)
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as {
    showModal: (this: HTMLDialogElement) => void;
    close: (this: HTMLDialogElement) => void;
  };
  proto.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement): void {
    this.removeAttribute('open');
  };
}

afterEach(() => {
  cleanup();
});
