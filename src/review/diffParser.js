import parseDiff from 'parse-diff'
// parse-diff library raw git diff string ko structured object mein convert karta hai

// ============================
// GITHUB SE DIFF FETCH KARO
// ============================
export async function fetchDiff(repoFullName, prNumber, token) {
  // repoFullName example: 'torvalds/linux' ya 'yourname/yourrepo'
  // prNumber: 42
  const url = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      // YE IMPORTANT HAI:
      // Default mein GitHub JSON bhejta hai (PR metadata)
      // Hume diff chahiye — isliye special Accept header
      Accept: 'application/vnd.github.v3.diff',
    }
  })

  if (!response.ok) {
    // Error details nikalo debugging ke liye
    const errorText = await response.text()
    throw new Error(`GitHub diff fetch fail: ${response.status} — ${errorText}`)
  }

  // Plain text diff string return hogi
  return response.text()
}

// ============================
// DIFF PARSE KARO
// ============================
export function parseDiffIntoChunks(rawDiff) {
  // parse-diff library rawDiff ko array of file objects mein convert karta hai
  const files = parseDiff(rawDiff)

  // Result store karne ke liye
  const chunks = []

  for (const file of files) {
    // file.to → naya filename (rename ke case mein)
    // file.from → purana filename

    // ---- SKIP KARO YE FILES ----

    // Deleted file — review ki zaroorat nahi
    // '/dev/null' matlab file delete ho gayi
    if (file.to === '/dev/null') continue

    // Binary files — images, videos, etc. — review nahi ho sakti
    if (file.isBinary) continue

    // Generated files — review waste of time
    const IGNORE_PATTERNS = [
      'node_modules',
      'package-lock.json',
      'yarn.lock',
      '.min.js',      // Minified JS
      'dist/',        // Build output
      'build/',
      '.map',         // Source maps
    ]
    const shouldIgnore = IGNORE_PATTERNS.some(pattern =>
      file.to.includes(pattern)
    )
    if (shouldIgnore) continue

    // Sirf code files review karo
    const ALLOWED_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'java', 'rb', 'php']
    const extension = file.to.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) continue

    // ---- HUNKS PROCESS KARO ----
    // Ek file mein multiple hunks ho sakte hain
    // Hunk = ek section of changes
    for (const hunk of file.chunks) {
      // hunk.changes → array of all lines (added, deleted, context)
      // Har change ka structure:
      // { type: 'add'|'del'|'normal', content: '+  const x = 1', ln: 42 }

      // Sirf added lines chahiye
      const addedLines = hunk.changes
        .filter(change => change.type === 'add')
        .map(change => ({
          lineNumber: change.ln,     // GitHub pe comment post karne ke liye
          content: change.content    // '+  const x = 1' (+ sign ke saath)
        }))

      // Agar koi added line nahi → skip
      if (addedLines.length === 0) continue

      // Context bhi rakho — AI ko surrounding code chahiye samajhne ke liye
      // Sirf added lines bhejoge toh AI ko context nahi milega
      const contextCode = hunk.changes
        .map(c => c.content)
        .join('\n')

      chunks.push({
        filename: file.to,       // 'src/server.js'
        addedLines,              // [{lineNumber: 42, content: '...'}]
        contextCode,             // Poora hunk with surrounding lines
      })
    }
  }

  return chunks
}