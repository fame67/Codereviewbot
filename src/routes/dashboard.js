import { saveToken } from '../db/tokenStore.js'

function requireLogin(req, reply, done) {
  if (!req.session.user) {
    reply.redirect('/?error=login_required')
    return
  }
  done()
}

export async function dashboardRoutes(app) {

  // ---- Landing Page ----
  app.get('/', async (req, reply) => {
    if (req.session.user) {
      return reply.redirect('/dashboard')
    }

    const error = req.query.error

    const errorMessages = {
      login_cancelled: 'Login was cancelled. Please try again.',
      token_failed:    'There was a problem connecting with GitHub.',
      login_required:  'Please login first.',
      invalid_state:   'Security error. Please try again.',
    }

    return reply.view('index.ejs', {
      error: errorMessages[error] || null
    })
  })

  // ---- Dashboard ----
  app.get('/dashboard', { preHandler: requireLogin }, async (req, reply) => {

    const user  = req.session.user
    const token = user.token

    const reposResponse = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=20&type=owner',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const repos = await reposResponse.json()

    if (!Array.isArray(repos)) {
      return reply.view('error.ejs', {
        message: 'There was a problem fetching repositories.'
      })
    }

    return reply.view('dashboard.ejs', {
      user,
      repos: repos.map(r => ({
        id:          r.id,
        name:        r.name,
        fullName:    r.full_name,
        description: r.description,
        isPrivate:   r.private,
        language:    r.language,
        updatedAt:   new Date(r.updated_at).toLocaleDateString('en-IN'),
        url:         r.html_url,
      }))
    })
  })

  // ---- Repo Select ----
  app.post('/repos/select', { preHandler: requireLogin }, async (req, reply) => {

    // Parse body — fixes buffer issue
    let repoFullName

    try {
      const parsed =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString('utf-8'))
            : req.body

      repoFullName = parsed.repoFullName

    } catch (err) {
      return reply
        .code(400)
        .send({ success: false, message: 'Body parse error' })
    }

    if (!repoFullName) {
      return reply
        .code(400)
        .send({ success: false, message: 'Repository name is missing' })
    }

    const token = req.session.user.token

    // Save token
    saveToken(repoFullName, token)

    // Check existing webhooks
    const existingRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/hooks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    )

    const existingHooks = await existingRes.json()

    if (Array.isArray(existingHooks)) {

      const alreadyExists = existingHooks.some(h =>
        h.config?.url === `${process.env.BASE_URL}/webhook`
      )

      if (alreadyExists) {
        return reply.send({
          success: true,
          message: 'Webhook is already configured! Open a PR — the bot will review it.'
        })
      }
    }

    // Create new webhook
    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/hooks`,
      {
        method: 'POST',

        headers: {
          Authorization:  `Bearer ${token}`,
          Accept:         'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          name:   'web',
          active: true,
          events: ['pull_request'],

          config: {
            url:          `${process.env.BASE_URL}/webhook`,
            content_type: 'json',
            secret:       process.env.GITHUB_WEBHOOK_SECRET,
            insecure_ssl: '0',
          }
        })
      }
    )

    const data = await response.json()

    if (response.ok) {

      return reply.send({
        success: true,
        message: 'Webhook has been configured successfully! Now open a PR — the bot will review it.'
      })

    } else {

      console.error('Webhook error:', data)

      return reply
        .code(400)
        .send({
          success: false,
          message: data.message || 'An error occurred while setting up the webhook'
        })
    }
  })
}
