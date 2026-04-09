import { createHash } from 'node:crypto'

const password = process.argv[2]

if (!password) {
  console.error('Usage: npm run hash:admin -- "your-password"')
  process.exit(1)
}

const hash = createHash('sha256').update(password, 'utf8').digest('hex')
console.log(hash)
