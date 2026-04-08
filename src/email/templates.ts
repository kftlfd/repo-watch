type EmailRenderResult = {
  subject: string;
  html: string;
};

export type ConfirmationEmailData = {
  repoName: string;
  confirmUrl: string;
};

export function renderConfirmationEmail(data: ConfirmationEmailData) {
  const subject = `Confirm subscription to ${data.repoName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>Confirm your subscription</h1>
  <p>Click the link below to confirm your subscription to <strong>${data.repoName}</strong>:</p>
  <p><a href="${data.confirmUrl}">${data.confirmUrl}</a></p>
</body>
</html>
`.trim();
  return { subject, html } as EmailRenderResult;
}

export type ReleaseEmailData = {
  repoName: string;
  tag: string;
  releaseUrl: string;
  unsubscribeUrl: string;
};

export function renderReleaseEmail(data: ReleaseEmailData) {
  const subject = `New release for ${data.repoName}: ${data.tag}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body>
  <h1>New release: ${data.repoName} ${data.tag}</h1>
  <p>A new release has been published for <strong>${data.repoName}</strong>.</p>
  <p><a href="${data.releaseUrl}">View release on GitHub</a></p>
  <hr>
  <p><a href="${data.unsubscribeUrl}">Unsubscribe from ${data.repoName} updates</a></p>
</body>
</html>
`.trim();
  return { subject, html } as EmailRenderResult;
}
