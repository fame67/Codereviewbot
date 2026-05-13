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
      token_failed:    'Failed to connect with GitHub.',
      login_required:  'Please login first.',
      invalid_state:   'Security validation failed. Please try again.',
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
        message: 'Failed to fetch repositories.'
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

  // ---- Repo Selection — Setup Webhook + Save Token ----
  app.post('/repos/select', { preHandler: requireLogin }, async (req, reply) => {

    const { repoFullName } = req.body
    const token = req.session.user.token

    // Save token for this repository
    saveToken(repoFullName, token)

    // Setup webhook
    try {

      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/hooks`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
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
          message: 'Webhook configured successfully!'
        })
      } else {

        // If webhook already exists
        if (data.errors?.[0]?.message?.includes('already exists')) {
          return reply.send({
            success: true,
            message: 'Webhook is already configured!'
          })
        }

        return reply.code(400).send({
          success: false,
          message: data.message
        })
      }

    } catch (err) {

      return reply.code(500).send({
        success: false,
        message: err.message
      })
    }
  })
}
