import 'dotenv/config'
import Fastify        from 'fastify'
import fastifyView    from '@fastify/view'
import fastifyStatic  from '@fastify/static'
import fastifyCookie  from '@fastify/cookie'
import fastifySession from '@fastify/session'
import ejs            from 'ejs'
import path           from 'node:path'
import { fileURLToPath } from 'node:url'

import { authRoutes }      from './routes/auth.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { handleWebhook }   from './webhook/githubWebhook.js'

// __dirname ES modules mein directly nahi milta
// Ye workaround hai
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app = Fastify({ logger: true })

// =====================
// PLUGINS REGISTER KARO
// =====================

// Cookie support — session ke liye zaroori
await app.register(fastifyCookie)

// Session — login state store karne ke liye
// User login kare toh uski info session mein rahegi
await app.register(fastifySession, {
  secret:      process.env.SESSION_SECRET,
  cookie: {
    secure:   false,  // Production mein true karo (HTTPS chahiye)
    httpOnly: true,   // JS se cookie access nahi hogi — XSS protection
    maxAge:   7 * 24 * 60 * 60 * 1000  // 7 din (milliseconds mein)
  },
  saveUninitialized: false  // Empty sessions save mat karo
})

// EJS template engine
// Views folder mein .ejs files dhundhega
await app.register(fastifyView, {
  engine: { ejs },
  root:   path.join(__dirname, '../views'),
   production: false, 
  // Har template mein ye variables automatically milenge
  defaultContext: {
    appName: 'CodeReviewBot',
    baseUrl: process.env.BASE_URL
  }
})

// Static files — CSS, images serve karne ke liye
await app.register(fastifyStatic, {
  root:   path.join(__dirname, '../public'),
  prefix: '/public/'  // URL: /public/style.css
})

// =====================
// WEBHOOK — Raw body chahiye HMAC ke liye
// =====================
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => done(null, body)
)

// =====================
// ROUTES
// =====================
app.register(authRoutes)       // /auth/login, /auth/callback, /auth/logout
app.register(dashboardRoutes)  // /, /dashboard, /repos

// Webhook GitHub se aata hai — alag route
app.post('/webhook', handleWebhook)

// =====================
// SERVER START
// =====================
try {
  await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
  console.log(`\n🤖 CodeReviewBot chal raha hai: ${process.env.BASE_URL}\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}