import Groq from 'groq-sdk'
import { fetchDiff, parseDiffIntoChunks } from './diffParser.js'
import { postReviewComments, postGeneralComment } from '../github/githubClient.js'
import { getToken } from '../db/tokenStore.js'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

export async function reviewPR(payload) {
  const pullRequest = payload.pull_request
  const repository  = payload.repository

  const token = getToken(repository.full_name)

  if (!token) {
    console.error(`[Bot] No token found for ${repository.full_name} — skipping`)
    return
  }

  console.log(`[Bot] Review started: PR #${pullRequest.number} in ${repository.full_name}`)

  const rawDiff = await fetchDiff(
    repository.full_name,
    pullRequest.number,
    token
  )

  const chunks = parseDiffIntoChunks(rawDiff)
  console.log(`[Bot] ${chunks.length} chunks found for review`)

  if (chunks.length === 0) {
    await postGeneralComment({
      token,
      owner:    repository.owner.login,
      repo:     repository.name,
      prNumber: pullRequest.number,
      body:     '✅ **CodeReviewBot:** No reviewable code changes found.'
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
      body:     '✅ **CodeReviewBot:** LGTM! No major issues found.'
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
    console.log(`[Bot] Posted ${allComments.length} comments`)
  }
}

async function reviewOneChunk(chunk, pullRequest) {
  const addedLineNumbers = chunk.addedLines.map(l => l.lineNumber).join(', ')

  const prompt = `You are an experienced senior software engineer reviewing code.

PR Title: "${pullRequest.title}"
File: ${chunk.filename}
New/changed lines: ${addedLineNumbers}

Code:
\`\`\`
${chunk.contextCode}
\`\`\`

Focus on these things:
1. Security issues (SQL injection, XSS, hardcoded passwords)
2. Performance (N+1 queries, memory leaks, blocking operations)
3. Bugs (wrong logic, null pointer, unhandled errors)
4. Bad practices (console.log in production, dead code)

RETURN ONLY THIS JSON FORMAT — do not write anything else:
[
  {
    "line": <line number from: ${addedLineNumbers}>,
    "severity": "low" | "medium" | "high" | "critical",
    "category": "security" | "performance" | "bug" | "practice",
    "comment": "What the issue is and how to fix it"
  }
]

If there are no issues: []`

  let responseText

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role:    'system',
          content: 'You are a senior software engineer. Return ONLY a valid JSON array and nothing else.'
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
    console.error(`[Bot] JSON parse failed:`, responseText)
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
