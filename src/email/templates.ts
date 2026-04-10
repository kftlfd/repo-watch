import { escapeHtmlTemplate } from '@/utils/html.js';

type EmailRenderResult = {
  subject: string;
  html: string;
};

export type ConfirmationEmailData = {
  repoName: string;
  confirmUrl: string;
};

export function renderConfirmationEmail(data: ConfirmationEmailData) {
  const { repoName, confirmUrl } = data;
  const subject = escapeHtmlTemplate`Confirm subscription to ${repoName}`;
  const html = escapeHtmlTemplate`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>Confirm your subscription</h1>
  <p>Click the link below to confirm your subscription to <strong>${repoName}</strong>:</p>
  <p><a href="${confirmUrl}">${confirmUrl}</a></p>
</body>
</html>`;
  return { subject, html } as EmailRenderResult;
}

export type ReleaseEmailData = {
  repoName: string;
  tag: string;
  releaseUrl: string;
  unsubscribeUrl: string;
};

export function renderReleaseEmail(data: ReleaseEmailData) {
  const { repoName, tag, releaseUrl, unsubscribeUrl } = data;
  const subject = escapeHtmlTemplate`New release for ${repoName}: ${tag}`;
  const html = escapeHtmlTemplate`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>New release: ${repoName} ${tag}</h1>
  <p>A new release has been published for <strong>${repoName}</strong>.</p>
  <p><a href="${releaseUrl}">View release on GitHub</a></p>
  <hr>
  <p><a href="${unsubscribeUrl}">Unsubscribe from ${repoName} updates</a></p>
</body>
</html>`;
  return { subject, html } as EmailRenderResult;
}
