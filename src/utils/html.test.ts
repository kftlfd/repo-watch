import { describe, expect, it } from 'vitest';

import { escapeHtmlTemplate } from './html.js';

describe('HTML utils', () => {
  it('Correctly escapes HTML', () => {
    const html = escapeHtmlTemplate`<p>${'&'} ${'<>'}</p>`;

    expect(html).toEqual(`<p>&amp; &lt;&gt;</p>`);
  });
});
