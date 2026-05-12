import crypto from 'node:crypto'
// node:crypto matlab Node.js built-in — koi install nahi karna
// Ye cryptographic functions deta hai — hashing, HMAC, etc.

import { reviewPR } from '../review/aiReviewer.js'

// ============================
// HMAC VERIFICATION FUNCTION
// ============================
function verifySignature(rawBody, signatureHeader) {
  // GitHub ne signature header nahi bheja → definitely fake
  if (!signatureHeader) return false

  // GitHub hamesha 'sha256=' se shuru karta hai
  // Example: 'sha256=a3f9b2c1d4...'
  if (!signatureHeader.startsWith('sha256=')) return false

  // Apna HMAC compute karo
  // createHmac(algorithm, secret) → HMAC object banao
  // .update(rawBody)             → data daalo
  // .digest('hex')               → hex string mein result lo
  const mySignature = 'sha256=' +
    crypto
      .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex')

  // ================================
  // TIMING ATTACK KYA HOTA HAI?
  // ================================
  // Normal comparison: 'abc' === 'xyz'
  // Pehla character 'a' vs 'x' → alag → TURANT return false
  // Pehla character 'a' vs 'a' → same → aage check karo
  //
  // Problem: Pehle character match hone pe thoda zyada time lagta hai
  // Attacker 1000 requests bhejta hai, response time measure karta hai
  // "Iss request pe 0.001ms zyada laga — pehla character sahi tha!"
  // Aise poora secret guess kar sakta hai
  //
  // timingSafeEqual HAMESHA same time lagata hai
  // Chahe 0 characters match hon ya sab match hon
  // Isliye ye use karte hain

  // Length alag hogi toh timingSafeEqual throw karega error
  // Pehle length check karo
  if (mySignature.length !== signatureHeader.length) return false

  // Ab safe comparison karo
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),    // Buffer mein convert karo
    Buffer.from(signatureHeader)
  )
}

// ============================
// MAIN WEBHOOK HANDLER
// ============================
export async function handleWebhook(req, reply) {
  // req.body → Buffer (kyunki humne content parser set kiya tha)
  // req.headers → GitHub ke sare headers
  const rawBody       = req.body
  const signatureHeader = req.headers['x-hub-signature-256']
  const githubEvent   = req.headers['x-github-event']

  // ---- STEP 1: Verify karo ----
  if (!verifySignature(rawBody, signatureHeader)) {
    // 401 = Unauthorized
    req.log.warn('Invalid webhook signature — reject kar rahe hain')
    return reply.code(401).send({ error: 'Invalid signature' })
  }

  // ---- STEP 2: JSON parse karo (verify ke BAAD) ----
  // Ab safe hai parse karna — hum confirm kar chuke hain ye GitHub se aaya
  const payload = JSON.parse(rawBody.toString('utf-8'))

  // ---- STEP 3: Event check karo ----
  // GitHub bahut saare events bhejta hai — push, star, issue, PR, etc.
  // Hume sirf pull_request events chahiye
  if (githubEvent !== 'pull_request') {
    // 200 bhejo — GitHub ko bura mat lagao
    // Bas batao ki humne ignore kiya
    return reply.code(200).send({ status: 'ignored', reason: 'not a PR event' })
  }

  // PR actions: opened, closed, reopened, synchronize, merged, etc.
  // 'opened'      → naya PR banaya
  // 'synchronize' → existing PR mein naye commits aaye
  // Hume sirf inhi pe review karni hai
  const REVIEW_ON = ['opened', 'synchronize']
  if (!REVIEW_ON.includes(payload.action)) {
    return reply.code(200).send({ status: 'ignored', reason: `action ${payload.action} not handled` })
  }

  // ---- STEP 4: Review background mein karo ----
  // GitHub expect karta hai 10 seconds mein response
  // AI review mein 30-60 seconds lag sakte hain (diff size pe depend)
  // Isliye pehle 202 bhejo, phir background mein review karo
  //
  // setImmediate → current request complete hone ke baad chalao
  // .catch → agar error ayi toh console mein print karo, crash mat karo
  setImmediate(() => {
    reviewPR(payload).catch(err => {
      console.error('PR review failed:', err.message)
    })
  })

  // 202 = Accepted (kaam shuru ho gaya, complete nahi hua abhi)
  return reply.code(202).send({ status: 'review queued' })
}