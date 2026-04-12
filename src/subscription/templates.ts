import { escapeHtmlTemplate } from '@/utils/html.js';

export const styles = `
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    max-width: 600px;
    margin: 50px auto;
    padding: 20px;
    line-height: 1.6;
    color: #333;
    background: #f5f5f5;
  }
  h1 { color: #222; margin-bottom: 10px; }
  .container {
    background: white;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  form { display: flex; flex-direction: column; gap: 16px; margin-top: 20px; }
  label { font-weight: 500; color: #555; }
  input {
    padding: 12px;
    font-family: monospace;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 100%;
  }
  input:focus { outline: none; border-color: #0066cc; }
  button {
    padding: 14px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
  }
  button:hover { background: #0052a3; }
  .input-group { display: flex; flex-direction: column; gap: 4px; }
  .success {
    color: #155724;
    padding: 15px;
    background: #e6ffe6;
    border-radius: 4px;
    border: 1px solid #c3e6cb;
  }
  .error {
    color: #721c24;
    padding: 15px;
    background: #f8d7da;
    border-radius: 4px;
    border: 1px solid #f5c6cb;
  }
  .links { margin-top: 20px; font-size: 14px; color: #666; }
  .links a { color: #0066cc; text-decoration: none; }
  .links a:hover { text-decoration: underline; }
</style>
`;

function renderPage(content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Release Notifier</title>
  ${styles}
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>
`;
}

export function renderHomeForm(): string {
  return renderPage(`
<h1>Subscribe to GitHub Releases</h1>
<p>Get email notifications when your favorite repositories release new versions.</p>

<form method="POST" action="/subscribe">
  <div class="input-group">
    <label for="email">Email</label>
    <input 
      id="email"
      name="email" 
      type="email" 
      placeholder="you@example.com" 
      required
    />
  </div>
  
  <div class="input-group">
    <label for="repo">Repository</label>
    <input 
      id="repo"
      name="repo" 
      type="text" 
      placeholder="torvalds/linux" 
      pattern="[^/]+/[^/]+"
      title="Format: owner/repo"
      required
    />
  </div>
  
  <button type="submit">Subscribe</button>
</form>
`);
}

export function renderSubscribeSuccess(): string {
  return renderPage(`
<div class="success">
  <h2>✓ Subscription Successful</h2>
  <p>Check your email to confirm your subscription. You'll receive a confirmation link shortly.</p>
</div>
<div class="links">
  <p><a href="/">Subscribe to another repository</a></p>
</div>
`);
}

export function renderSubscribeError(message: string): string {
  return renderPage(
    escapeHtmlTemplate`
<h1>Subscribe to GitHub Releases</h1>
<div class="error">
  <strong>Error:</strong> ${message}
</div>
<form method="POST" action="/subscribe">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required />
  <label for="repo">Repository</label>
  <input id="repo" name="repo" type="text" pattern="[^/]+/[^/]+" placeholder="owner/repo" required />
  <button type="submit">Try Again</button>
</form>
<div class="links">
  <p><a href="/">← Back to home</a></p>
</div>
`,
  );
}

export function renderConfirmSuccess(): string {
  return renderPage(`
<div class="success">
  <h2>✓ Subscription Confirmed</h2>
  <p>You'll now receive email notifications when this repository has new releases.</p>
</div>
<div class="links">
  <p><a href="/">Subscribe to more repositories</a></p>
</div>
`);
}

export function renderConfirmError(message: string): string {
  return renderPage(
    escapeHtmlTemplate`
<h1>Confirmation Failed</h1>
<div class="error">
  ${message}
</div>
<div class="links">
  <p><a href="/">Subscribe again</a></p>
</div>
`,
  );
}

export function renderUnsubscribeSuccess(): string {
  return renderPage(`
<div class="success">
  <h2>✓ Unsubscribed</h2>
  <p>You've been unsubscribed from this repository's release notifications.</p>
</div>
<div class="links">
  <p><a href="/">Subscribe to other repositories</a></p>
</div>
`);
}

export function renderUnsubscribeError(message: string): string {
  return renderPage(
    escapeHtmlTemplate`
<h1>Unsubscribe Failed</h1>
<div class="error">
  ${message}
</div>
<div class="links">
  <p><a href="/">Go to home</a></p>
</div>
`,
  );
}
