import Groq from 'groq-sdk'
import { fetchDiff, parseDiffIntoChunks } from './diffParser.js'
import { postReviewComments, postGeneralComment } from '../github/githubClient.js'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

// export yahan hai — neeche module.exports ki zaroorat nahi
export async function reviewPR(payload) {
  const pullRequest = payload.pull_request
  const repository  = payload.repository
  const token       = process.env.GITHUB_TOKEN

  console.log(`[Bot] Review shuru: PR #${pullRequest.number} in ${repository.full_name}`)

  const rawDiff = await fetchDiff(
    repository.full_name,
    pullRequest.number,
    token
  )

  const chunks = parseDiffIntoChunks(rawDiff)
  console.log(`[Bot] ${chunks.length} chunks milein review ke liye`)

  if (chunks.length === 0) {
    await postGeneralComment({
      token,
      owner:    repository.owner.login,
      repo:     repository.name,
      prNumber: pullRequest.number,
      body:     '✅ **CodeReviewBot:** Koi reviewable code change nahi mila.'
    })
    return
  }

  const allComments = []
  const chunksToReview = chunks.slice(0, 10)

  for (const chunk of chunksToReview) {
    console.log(`[Bot] Reviewing: ${chunk.filename}`)
    const comments = await reviewOneChunk(chunk, pullRequest)
    allComments.push(...comments)
    await sleep(500)
  }

  if (allComments.length === 0) {
    await postGeneralComment({
      token,
      owner:    repository.owner.login,
      repo:     repository.name,
      prNumber: pullRequest.number,
      body:     '✅ **CodeReviewBot:** LGTM! Koi major issue nahi mila.'
    })
  } else {
    await postReviewComments({
      token,
      owner:     repository.owner.login,
      repo:      repository.name,
      prNumber:  pullRequest.number,
      commitSha: pullRequest.head.sha,
      comments:  allComments,
    })
    console.log(`[Bot] ${allComments.length} comments post kiye`)
  }
}

async function reviewOneChunk(chunk, pullRequest) {
  const addedLineNumbers = chunk.addedLines.map(l => l.lineNumber).join(', ')

  const prompt = `Tu ek experienced senior software engineer hai jo code review kar raha hai.

PR Title: "${pullRequest.title}"
File: ${chunk.filename}
Naye/changed lines: ${addedLineNumbers}

Code:
\`\`\`
${chunk.contextCode}
\`\`\`

In chezon pe dhyan de:
1. Security issues (SQL injection, XSS, hardcoded passwords)
2. Performance (N+1 queries, memory leaks, blocking operations)
3. Bugs (wrong logic, null pointer, unhandled errors)
4. Bad practices (console.log in production, dead code)

SIRF YE JSON FORMAT RETURN KAR — kuch aur mat likho:
[
  {
    "line": <line number from: ${addedLineNumbers}>,
    "severity": "low" | "medium" | "high" | "critical",
    "category": "security" | "performance" | "bug" | "practice",
    "comment": "Kya issue hai aur kaise fix karo"
  }
]

Agar koi issue nahi: []`

  let responseText

  try {
    const response = await groq.chat.completions.create({
     model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role:    'system',
          content: 'Tu ek senior software engineer hai. SIRF valid JSON array return kar, kuch aur nahi.'
        },
        {
          role:    'user',
          content: prompt
        }
      ],
      max_tokens:  1000,
      temperature: 0.1,
    })

    responseText = response.choices[0].message.content.trim()

  } catch (err) {
    console.error(`[Bot] Groq API error:`, err.message)
    return []
  }

  let issues
  try {
    const cleaned = responseText
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    issues = JSON.parse(cleaned)
    if (!Array.isArray(issues)) return []

  } catch (err) {
    console.error(`[Bot] JSON parse fail:`, responseText)
    return []
  }

  const validLines = new Set(chunk.addedLines.map(l => l.lineNumber))

  return issues
    .filter(i => validLines.has(i.line))
    .filter(i => ['medium', 'high', 'critical'].includes(i.severity))
    .map(i => ({
      path: chunk.filename,
      line: i.line,
      side: 'RIGHT',
      body: formatComment(i),
    }))
}

function formatComment(issue) {
  const emoji = { low: '💡', medium: '⚠️', high: '🚨', critical: '🔴' }
  const label = {
    security:    'SECURITY',
    performance: 'PERFORMANCE',
    bug:         'BUG',
    practice:    'BEST PRACTICE'
  }
  return `${emoji[issue.severity]} **[${label[issue.category]}]**\n\n${issue.comment}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ❌ module.exports NAHI — ye file ES Module hai
// ✅ Export upar function ke saath ho chuka hai: export async function reviewPR