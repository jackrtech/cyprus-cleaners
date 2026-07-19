# Contributing to Cyprus Cleaners

## Starting a session
Always start with:
```bash
npm run start-dev
```
This pulls the latest code, installs packages, checks your environment, and starts the dev server.

## First time setup
1. Clone the repo
2. Copy .env.example to .env.local and fill in the values (get the values from Jack)
3. Run: npm run prepare (activates git hooks)
4. Run: npm run start-dev

## Before finishing a session
Always commit and push your work:
```bash
git add .
git commit -m "describe what you changed"
git push origin main
```

## Rules
- Never commit .env.local
- Always pull before starting work
- Always push before finishing
- If you see TypeScript errors, fix them before pushing
- Ask Jack if you're unsure about anything
