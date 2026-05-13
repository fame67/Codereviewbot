// GitHub OAuth flow kaise kaam karta hai:
//
// 1. User /auth/login pe jaata hai
//    → Hum GitHub pe redirect karte hain with client_id
//
// 2. User GitHub pe permission deta hai
//    → GitHub /auth/callback pe redirect karta hai with ?code=xxx
//
// 3. Hum us code ko access token ke liye exchange karte hain
//    → GitHub token deta hai
//
// 4. Token se user ki info fetch karte hain
//    → Session mein save karte hain
//
// 5. Dashboard pe redirect karo

export async function authRoutes(app) {

  // ---- STEP 1: Login ----
  // User yahan aata hai → GitHub pe bhejo
  app.get('/auth/login', async (req, reply) => {
    // GitHub OAuth URL
    // scope=repo → user ke repos access karne ki permission
    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize')
    githubAuthUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID)
    githubAuthUrl.searchParams.set('scope',     'repo read:user')
    githubAuthUrl.searchParams.set('redirect_uri',
      `${process.env.BASE_URL}/auth/callback`
    )

    // CSRF protection ke liye random state
    // Callback mein verify karenge
    const state = Math.random().toString(36).slice(2)
    req.session.oauthState = state
    githubAuthUrl.searchParams.set('scope', 'repo read:user admin:repo_hook')


    return reply.redirect(githubAuthUrl.toString())
  })

  // ---- STEP 2: Callback ----
  // GitHub yahan redirect karta hai login ke baad
  app.get('/auth/callback', async (req, reply) => {
    const { code, state, error } = req.query

    // User ne cancel kiya
    if (error) {
      return reply.redirect('/?error=login_cancelled')
    }

    // CSRF check — state match karna chahiye
    if (state !== req.session.oauthState) {
      return reply.redirect('/?error=invalid_state')
    }

    // ---- Code → Access Token exchange ----
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept:         'application/json'  // JSON format mein chahiye
        },
        body: JSON.stringify({
          client_id:     process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        })
      }
    )

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('Token exchange failed:', tokenData)
      return reply.redirect('/?error=token_failed')
    }

    const accessToken = tokenData.access_token

    // ---- Access Token → User Info ----
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github.v3+json'
      }
    })

    const user = await userResponse.json()

    // ---- Session mein save karo ----
    req.session.user = {
      id:        user.id,
      login:     user.login,       // GitHub username
      name:      user.name,        // Full name
      avatarUrl: user.avatar_url,  // Profile picture
      token:     accessToken,      // Repos access ke liye
    }

    // Dashboard pe bhejo
    return reply.redirect('/dashboard')
  })

  // ---- Logout ----
  app.get('/auth/logout', async (req, reply) => {
    await req.session.destroy()
    return reply.redirect('/')
  })
}
