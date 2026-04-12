import { escapeHtmlTemplate } from '@/utils/html.js';

type EmailRenderResult = {
  subject: string;
  html: string;
};

export type ConfirmationEmailData = {
  repoName: string;
  confirmHtmlUrl: string;
  confirmApiUrl: string;
};

export function renderConfirmationEmail(data: ConfirmationEmailData) {
  const { repoName, confirmHtmlUrl, confirmApiUrl } = data;
  const subject = escapeHtmlTemplate`Confirm subscription to ${repoName}`;
  const html = escapeHtmlTemplate`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>Confirm your subscription</h1>
  <p>Click one the link below to confirm your subscription to <strong>${repoName}</strong>:</p>
  <p><a href="${confirmHtmlUrl}">${confirmHtmlUrl}</a></p>
  <hr>
  <p>Or use API URL: <a href="${confirmApiUrl}">${confirmApiUrl}</a></p>
</body>
</html>`;
  return { subject, html } as EmailRenderResult;
}

export type ReleaseEmailData = {
  repoName: string;
  tag: string;
  releaseUrl: string;
  unsubscribeHtmlUrl: string;
  unsubscribeApiUrl: string;
};

export function renderReleaseEmail(data: ReleaseEmailData) {
  const { repoName, tag, releaseUrl, unsubscribeHtmlUrl, unsubscribeApiUrl } = data;
  const subject = escapeHtmlTemplate`New release for ${repoName}: ${tag}`;
  const html = escapeHtmlTemplate`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>New release: ${repoName}@${tag}</h1>
  <p>A new release has been published for <strong>${repoName}</strong>: <strong>${tag}</strong>.</p>
  <p><a href="${releaseUrl}">View release on GitHub</a></p>
  <hr>
  <p><a href="${unsubscribeHtmlUrl}">Unsubscribe</a></p>
  <p>Unsubscribe API URL: <a href="${unsubscribeApiUrl}">${unsubscribeApiUrl}</a></p>
</body>
</html>`;
  return { subject, html } as EmailRenderResult;
}
