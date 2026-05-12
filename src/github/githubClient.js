// ============================
// INLINE PR COMMENTS POST KARO
// ============================
export async function postReviewComments({
  token,
  owner,      // 'yourname'
  repo,       // 'yourrepo'
  prNumber,   // 42
  commitSha,  // 'abc123def...' — PR ka latest commit
  comments,   // [{path, line, side, body}]
}) {
  // GitHub Review API
  // Ye sirf inline comments deta hai — exact line pe
  // Issues Comment API alag hoti hai — wo PR ke neeche comment karta hai
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`

  const body = {
    commit_id: commitSha,

    // event ke 3 options hain:
    // 'COMMENT'         → Sirf comment, koi action nahi
    // 'APPROVE'         → PR approve karo
    // 'REQUEST_CHANGES' → Changes maango (PR merge nahi hogi)
    event: 'COMMENT',

    // Comments array — har ek exact line pe jayega
    comments: comments.map(c => ({
      path: c.path,    // 'src/server.js'
      line: c.line,    // 42
      side: c.side,    // 'RIGHT' = new code, 'LEFT' = old code
      body: c.body,    // Markdown comment text
    }))
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/vnd.github.v3+json',
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub review post fail: ${response.status} — ${errorText}`)
  }

  return response.json()
}

// ============================
// GENERAL PR COMMENT (LGTM, etc.)
// ============================
export async function postGeneralComment({
  token,
  owner,
  repo,
  prNumber,
  body,   // Markdown text
}) {
  // Ye Issues Comment API hai — PR ke neeche comment karta hai
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub comment post fail: ${response.status} — ${errorText}`)
  }

  return response.json()
}