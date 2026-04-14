// GitHub Contents API — schreibt in privates Repo
const GitHub = (() => {
  const FILE_PATH = 'life_log.log';

  function config() {
    return {
      user:  localStorage.getItem('gh_user'),
      repo:  localStorage.getItem('gh_repo'),
      token: localStorage.getItem('gh_token'),
    };
  }

  function isConfigured() {
    const c = config();
    return !!(c.user && c.repo && c.token);
  }

  function save(user, repo, token) {
    localStorage.setItem('gh_user',  user.trim());
    localStorage.setItem('gh_repo',  repo.trim());
    localStorage.setItem('gh_token', token.trim());
  }

  async function getFile() {
    const { user, repo, token } = config();
    const res = await fetch(
      `https://api.github.com/repos/${user}/${repo}/contents/${FILE_PATH}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );
    if (res.status === 404) return { content: '', sha: null };
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const data = await res.json();
    return {
      content: atob(data.content.replace(/\n/g, '')),
      sha: data.sha,
    };
  }

  async function getLines() {
    const { content } = await getFile();
    if (!content) return [];
    return content.split('\n').filter(l => l.trim());
  }

  async function appendLine(line) {
    if (!isConfigured()) return;
    const { user, repo, token } = config();
    const { content, sha } = await getFile();
    const newContent = content ? content + '\n' + line : line;
    const body = {
      message: `log: ${new Date().toISOString().slice(0, 10)}`,
      content: btoa(new TextEncoder().encode(newContent).reduce((s, b) => s + String.fromCharCode(b), '')),
    };
    if (sha) body.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${user}/${repo}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
  }

  async function writeLines(lines) {
    if (!isConfigured()) return;
    const { user, repo, token } = config();
    const { sha } = await getFile();
    const newContent = lines.join('\n');
    const body = {
      message: `log: update ${new Date().toISOString().slice(0, 10)}`,
      content: btoa(new TextEncoder().encode(newContent).reduce((s, b) => s + String.fromCharCode(b), '')),
    };
    if (sha) body.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${user}/${repo}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
  }

  return { isConfigured, save, config, getLines, appendLine, writeLines };
})();
