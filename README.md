# The ID Game

## Run

1. Install dependencies via `pnpm install`
2. Add environment variables to `.env.local`
   ```env
   NODE_ENV=development

    # Convex
    CONVEX_DEPLOYMENT=<your-convex-deployment>
    NEXT_PUBLIC_CONVEX_URL=<your-convex-url>
    
    # Clerk
    CLERK_JWT_ISSUER_DOMAIN=<your-clerk-domain>
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-clerk-publishable-key>
    CLERK_SECRET_KEY=<your-clerk-secret-key>
    
    # Posthog
    NEXT_PUBLIC_POSTHOG_KEY=<your-posthog-key>
    NEXT_PUBLIC_POSTHOG_API_HOST=/ingest # DO NOT CHANGE
    NEXT_PUBLIC_POSTHOG_UI_HOST=<your-posthog-host-url>
    ```
4. Start app with `pnpm start`

## Architecture

### Backend

- [Convex](https://www.convex.dev): "Reactive" real-time database
- [Clerk](https://clerk.com): User Identity and Access Management
- [PostHog](): Analytics
- [Vercel](): Server deployment

The backend needed to support multiple clients, with varying network conditions,
but transmit updates reliably. There was a case for a peer-to-peer network using
WebRTC but there were concerns about NAT and firewall protections within the target
user demographic, such as university networks. Convex provided stronger consistency
guarantees which was crucial for ensuring correct game state across clients,
ultimately suiting the needs of the game closer.

### Frontend

- [Next.js](https://nextjs.org)
- [Tailwind](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Dice UI](https://www.diceui.com)

These are tools were selected due to their familiarity and my ability to quickly iterate
toward a functional game. Since Convex was built for React, the seamless integration enabled
straightforward state management and UI synchronisation, providing a responsive user experience with minimal overhead.

## Gameplay

1. Create a game room
2. Wait for players to join
3. Start Round
    1. Server allocates 10 scenarios to choose from
    2. Round host picks 1 scenario from the list
    3. Round host orders players in most-to-least likely
    4. Non-host players receives the allocated 10 scenarios
    5. Each player guesses which scenario round host picked
    6. Once all players have picked, results are shown
4. Play again

## DB Schema

Navigate to `./convex/schema.ts` to view the schema definitions.
