// Simple JSON file mein store karenge
import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = path.join(process.cwd(), 'tokens.json')

function readDB() {
  if (!fs.existsSync(DB_PATH)) return {}
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

// Token save karo — repoFullName ke saath
export function saveToken(repoFullName, token) {
  const db = readDB()
  db[repoFullName] = token
  writeDB(db)
}

// Token fetch karo
export function getToken(repoFullName) {
  const db = readDB()
  return db[repoFullName] || null
}