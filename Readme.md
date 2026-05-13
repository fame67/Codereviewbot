# 🤖 CodeReviewBot

An AI-powered GitHub Pull Request reviewer that automatically analyzes code for security vulnerabilities, bugs, and performance issues — the moment a PR is opened.

**Live Demo:** [codereviewbot-production-d029.up.railway.app](https://codereviewbot-production-d029.up.railway.app)

---

## ✨ Features

- **🔒 Security Check** — Detects SQL injection, XSS, hardcoded secrets
- **⚡ Performance** — Identifies N+1 queries, memory leaks, blocking operations
- **🐛 Bug Detection** — Catches logic errors, null pointers, unhandled edge cases
- **💬 Inline Comments** — Posts review comments on the exact line in the PR
- **👥 Multi-user** — Every user's repos use their own GitHub token
- **🔐 Secure Webhooks** — HMAC-SHA256 signature verification on every request

---

## 🛠️ Tech Stack

| Technology | Usage |
|------------|-------|
| Node.js | Runtime |
| Fastify | Web framework |
| EJS | Templating |
| GitHub OAuth 2.0 | Authentication |
| GitHub Webhooks | PR event triggers |
| GitHub REST API | Posting review comments |
| Groq API (LLaMA 3.3 70B) | AI code review |
| Railway | Deployment |

---

## 🚀 How It Works

```
1. User logs in with GitHub OAuth
2. Selects a repo → Webhook is automatically configured
3. A Pull Request is opened on that repo
4. GitHub sends webhook event to CodeReviewBot
5. Bot fetches the PR diff
6. Groq AI (LLaMA 3.3) analyzes the code
7. Inline review comments are posted on the PR
```

---

## 📸 Screenshots

> Login Page

![Login Page](https://codereviewbot-production-d029.up.railway.app/public/screenshots/login.png)

> Dashboard — Select your repo

![Dashboard](https://codereviewbot-production-d029.up.railway.app/public/screenshots/dashboard.png)

> AI Review comments on a PR

![PR Review](https://codereviewbot-production-d029.up.railway.app/public/screenshots/review.png)

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 18+
- GitHub OAuth App
- Groq API Key
- ngrok (for local webhook testing)

### 1. Clone the repo

```bash
git clone https://github.com/fame67/Codereviewbot.git
cd Codereviewbot
npm install
```

### 2. Create `.env` file

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_WEBHOOK_SECRET=any_random_secret
GROQ_API_KEY=your_groq_api_key
SESSION_SECRET=any_random_string
BASE_URL=https://your-ngrok-url.ngrok-free.app
PORT=3000
```

### 3. GitHub OAuth App Setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. New OAuth App
3. Set callback URL: `http://localhost:3000/auth/callback`

### 4. Start ngrok

```bash
ngrok http 3000
```

Copy the ngrok URL and put it in `BASE_URL` in `.env`

### 5. Run the app

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🌐 Deployment (Railway)

1. Push code to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Add these environment variables in Railway dashboard:

```
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_WEBHOOK_SECRET
GROQ_API_KEY
SESSION_SECRET
BASE_URL=https://your-app.up.railway.app
PORT=3000
```

4. Generate domain in Railway → Settings → Domains
5. Update GitHub OAuth App callback URL to Railway URL

---

## 📁 Project Structure

```
src/
├── app.js                  # Fastify server setup
├── routes/
│   ├── auth.js             # GitHub OAuth routes
│   └── dashboard.js        # Dashboard + webhook setup
├── webhook/
│   └── githubWebhook.js    # Webhook handler + HMAC verification
├── review/
│   ├── aiReviewer.js       # Groq AI review logic
│   └── diffParser.js       # PR diff parser
├── github/
│   └── githubClient.js     # GitHub API client
└── db/
    └── tokenStore.js       # User token storage
views/
├── index.ejs               # Landing page
└── dashboard.ejs           # Dashboard
public/
└── style.css               # Styles
```

---

## 🔐 Security

- HMAC-SHA256 webhook signature verification
- CSRF protection via OAuth state parameter
- HttpOnly session cookies
- Secrets stored in environment variables only — never in code

---

## 📄 License

MIT

---

Made with ❤️ 
