// Auth check middleware — login nahi hai toh login page pe bhejo
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
    // Agar pehle se login hai → dashboard pe bhejo
    if (req.session.user) {
      return reply.redirect('/dashboard')
    }

    const error = req.query.error

    // Error messages
    const errorMessages = {
      login_cancelled: 'Login cancel kar diya. Dobara try karo.',
      token_failed:    'GitHub se connect karne mein problem aayi.',
      login_required:  'Pehle login karo.',
      invalid_state:   'Security error. Dobara try karo.',
    }

    return reply.view('index.ejs', {
      error: errorMessages[error] || null
    })
  })

  // ---- Dashboard ----
  app.get('/dashboard', { preHandler: requireLogin }, async (req, reply) => {
    const user  = req.session.user
    const token = user.token

    // User ke repos fetch karo
    const reposResponse = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=20&type=owner',
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )

    const repos = await reposResponse.json()

    // Array nahi aaya toh error hai
    if (!Array.isArray(repos)) {
      return reply.view('error.ejs', {
        message: 'Repos fetch karne mein problem aayi.'
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
}