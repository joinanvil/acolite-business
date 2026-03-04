# Acolite - AI Business Platform

Build and run your business using AI agents.

## Features

- Google OAuth authentication
- Dashboard for managing AI agents
- Workflow automation
- Business analytics

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Authentication**: Better Auth with Google OAuth
- **Database**: SQLite with Kysely
- **UI**: shadcn/ui + Tailwind CSS
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Configure Google OAuth credentials in .env

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services > Credentials**
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Secret to your `.env` file

## Project Structure

```
src/
├── app/
│   ├── api/auth/[...all]/   # Auth API routes
│   ├── dashboard/           # Protected dashboard
│   ├── login/               # Login page
│   └── page.tsx             # Landing page
├── components/ui/           # shadcn components
└── lib/
    ├── auth.ts              # Better Auth config
    └── auth-client.ts       # Client auth utilities
```

## License

MIT
