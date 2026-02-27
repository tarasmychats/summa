# WealthTrack

Multi-asset wealth tracking app — monorepo with Node.js backend and iOS app.

## Structure

- `backend/` — Node.js/TypeScript price API server
- `ios/WealthTrack/` — SwiftUI iOS app
- `docs/plans/` — Design and implementation documents

## Backend commands

- `cd backend && npm run dev` — start dev server
- `cd backend && npm test` — run tests
- `cd backend && npm run build` — compile TypeScript

## Key decisions

- Backend is a stateless price proxy — no user data stored server-side
- User portfolio data lives in CloudKit (via SwiftData)
- All business logic (projections, risk, insights) runs on-device in the iOS app
