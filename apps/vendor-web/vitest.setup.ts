import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no <dialog> modal API; emulate the open attribute so dialogs render their content.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

afterEach(() => {
  cleanup();
});
